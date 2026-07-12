#----------------------------------------------------------#
# Scrapes the link of the Apply page provided, or requests #
# a copy and paste option if the length of the scraped     #
# content is less than MIN_CHAR_REQUIRD.                   #
#                                                          #
# Then the content is passed to llm for a schematic output #
# that highlights specific roles to each statements on its #
# importance                                               #
#----------------------------------------------------------#

import asyncio
from typing import TypedDict, Optional
from os import getenv

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from schemas import JDRequirement, RefinedJD
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.store.postgres import PostgresStore
from system_prompts import SYSTEM_PROMPT_FOR_JD_REFINEMENT

MIN_CHAR_REQUIRED = 500

serde = JsonPlusSerializer(allowed_msgpack_modules=[("schemas", "RefinedJD")])

load_dotenv()

llm = ChatOpenAI(
    base_url=getenv("FREELLMAPI_URL"),
    api_key=getenv("FREELLMAPI_KEY"),
    model="auto" 
)

DB_URI = getenv("DB_URI")
BLOCKED_DOMAINS = ["linkedin.com", "indeed.com"]

def needs_manual_paste(url: str) -> bool:
    return any(domain in url for domain in BLOCKED_DOMAINS)


async def scrape_jd(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        )
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1500)
        text = await page.inner_text("body")
        await browser.close()
    return text

############################# States ################################
class JDState(TypedDict):
    url: Optional[str]
    pasted_text: Optional[str]
    jd_text: Optional[str]
    needs_paste: bool
    error: Optional[str]
    refined_jd: Optional[RefinedJD]


jd_refinement_parser = PydanticOutputParser(pydantic_object=RefinedJD)

####################### Node ######################
async def fetch_jd_node(state: JDState, config) -> dict:
    if state.get("pasted_text"):
        return {"jd_text": state["pasted_text"], "needs_paste": False, "error": None}

    url = state.get("url")
    if not url:
        return {"jd_text": None, "needs_paste": True, "error": "No URL or pasted text provided."}

    if needs_manual_paste(url):
        return {
            "jd_text": None,
            "needs_paste": True,
            "error": f"{url} is a known scraping-blocked site (LinkedIn/Indeed). Please paste the JD text."
        }

    try:
        text = await scrape_jd(url)
        if len(text.strip()) < MIN_CHAR_REQUIRED:
            return {
                "jd_text": None,
                "needs_paste": True,
                "error": "Scraped content looked too short/empty — likely blocked or JS didn't render. Please paste the JD text."
            }
        return {"jd_text": text, "needs_paste": False, "error": None}
    except Exception as e:
        return {"jd_text": None, "needs_paste": True, "error": f"Scraping failed: {e}"}


def refine_jd(state: JDState, config) -> dict:
    jd_text = state.get("jd_text")
    if not jd_text:
        raise ValueError("No jd_text found in state — nothing to refine.")

    prompt = (
        f"{jd_refinement_parser.get_format_instructions()}\n\n"
        f"{SYSTEM_PROMPT_FOR_JD_REFINEMENT}\n\n"
        f"RAW SCRAPED JD TEXT:\n{jd_text}"
    )

    output = llm.invoke(prompt) 
    refined: RefinedJD = jd_refinement_parser.parse(output.content)

    return {"refined_jd": refined}


def route_after_fetch(state: JDState) -> str:
    return "request_paste" if state["needs_paste"] else "refine_jd"


def request_paste_node(state: JDState, config) -> dict:
    pasted = interrupt({"message": state.get("error", "Please paste the job description text.")})
    return {"pasted_text": pasted, "needs_paste": False}


###################### Build graph #####################
builder = StateGraph(JDState)
builder.add_node("fetch_jd", fetch_jd_node)
builder.add_node("request_paste", request_paste_node)
builder.add_node("refine_jd", refine_jd)

builder.add_edge(START, "fetch_jd")
builder.add_conditional_edges("fetch_jd", route_after_fetch, {
    "request_paste": "request_paste",
    "refine_jd": "refine_jd"
})
builder.add_edge("request_paste", "fetch_jd")  
builder.add_edge("refine_jd", END)


async def setup_checkpointer():
    """Run this once, ever, to create the checkpoint tables in Postgres."""
    async with AsyncPostgresSaver.from_conn_string(DB_URI) as checkpointer:
        await checkpointer.setup()

def persist_refined_jd(user_id: str, job_id: str, refined_jd: RefinedJD):
    """Save a refined JD to the store, keyed by job_id, so it can be fetched later without re-scraping."""
    with PostgresStore.from_conn_string(DB_URI) as store:
        store.setup()
        store.put(("user", user_id, "refined_jds"), job_id, {"data": refined_jd.model_dump()})


def get_refined_jd(store: BaseStore, user_id: str, job_id: str) -> RefinedJD:
    """Fetch a previously saved refined JD from the given store."""
    result = store.get(("user", user_id, "refined_jds"), job_id)
    if result is None:
        raise ValueError(
            f"No refined JD found for job_id={job_id!r}, user_id={user_id!r}. "
            f"Has this JD been scraped/refined yet?"
        )
    return RefinedJD.model_validate(result.value["data"])


async def process_jd(user_id: str, url: str = None, pasted_text: str = None, thread_id: str = "default") -> dict:
    async with AsyncPostgresSaver.from_conn_string(DB_URI, serde=serde) as checkpointer:
        graph = builder.compile(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke({"url": url, "pasted_text": pasted_text}, config)

        if result.get("__interrupt__"):
            interrupt_data = result["__interrupt__"][0].value
            return {"status": "needs_paste", "message": interrupt_data.get("message"), "thread_id": thread_id}

        refined_jd = result["refined_jd"]
        persist_refined_jd(user_id=user_id, job_id=thread_id, refined_jd=refined_jd)

        return {
            "status": "done",
            "jd_text": result["jd_text"],
            "refined_jd": refined_jd
        }


async def resume_with_paste(user_id: str, pasted_text: str, thread_id: str = "default") -> dict:
    async with AsyncPostgresSaver.from_conn_string(DB_URI, serde=serde) as checkpointer:
        graph = builder.compile(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke(Command(resume=pasted_text), config)

        refined_jd = result["refined_jd"]
        persist_refined_jd(user_id=user_id, job_id=thread_id, refined_jd=refined_jd)

        return {
            "status": "done",
            "jd_text": result["jd_text"],
            "refined_jd": refined_jd
        }