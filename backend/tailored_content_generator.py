from langgraph.store.postgres import PostgresStore
from schemas import ResumeFact, TailoredResumeContent, CoverLetter
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import PydanticOutputParser
from jd_scraper import get_refined_jd
from typing import TypedDict, Optional, List
from os import getenv
from dotenv import load_dotenv
from langgraph.store.base import BaseStore
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from resume_docx_utils import extract_style_profile, build_resume_docx
from coverletter_docx_utils import build_coverletter_docx, get_docx_page_count
from langgraph.checkpoint.memory import InMemorySaver
from pathlib import Path
from system_prompts import SYSTEM_PROMPT_FOR_TAILORING_RESUME, SYSTEM_PROMPT_FOR_COVER_LETTER_GENERATION, SYSTEM_PROMPT_FOR_COVER_LETTER_SHORTENING
import json

DB_URI = "postgresql://postgres:postgres@localhost:54320/postgres?sslmode=disable"
RESUME_LOC = "resume.docx"

load_dotenv()
llm = ChatOpenAI(
    base_url=getenv("FREELLMAPI_URL"),
    api_key=getenv("FREELLMAPI_KEY"),
    model="auto" 
)
class TailoredResumeState(TypedDict):
    tailored_resume: Optional[TailoredResumeContent]
    resume_docx_path: Optional[str]
    cover_letter: Optional[CoverLetter]
    cover_letter_docx_path: Optional[str]
    page_count: Optional[int]
    shorten_attempts: Optional[int]

tailor_resume_parser = PydanticOutputParser(
    pydantic_object=TailoredResumeContent
)

cover_letter_parser = PydanticOutputParser(
    pydantic_object=CoverLetter
)
def tailor_resume_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    result = store.get(("user", user_id, "resume_facts"), "current")
    resume_facts = ResumeFact.model_validate(result.value["data"])
    refined_jd = get_refined_jd(user_id=user_id, job_id=jd_id)

    prompt = f"""
    Resume facts:
    {resume_facts.model_dump_json(indent=2)}
    Job description:
    {refined_jd.model_dump_json(indent=2)}
    {tailor_resume_parser.get_format_instructions()}
    \n
    {SYSTEM_PROMPT_FOR_TAILORING_RESUME}
    """
    response = llm.invoke(prompt)
    tailored = tailor_resume_parser.parse(response.content)

    store.put(
        ("user", user_id, "tailored_resumes"),
        jd_id,
        {"data": tailored.model_dump()}
    )

    return {"tailored_resume": tailored}

def generate_resume_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    retrieve_tailored_resume = store.get(("user", user_id, "tailored_resumes"), jd_id)
    tailored_resume = retrieve_tailored_resume.value["data"]

    style = extract_style_profile(RESUME_LOC)
    doc_bytes = build_resume_docx(tailored_resume, style)

    out_dir = Path("tmp")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{user_id}_{jd_id}_resume.docx"
    with open(out_path, "wb") as f:
        f.write(doc_bytes)

    return {"resume_docx_path": out_path}

def generate_coverletter_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    result = store.get(("user", user_id, "resume_facts"), "current")
    resume_facts = ResumeFact.model_validate(result.value["data"])
    refined_jd = get_refined_jd(user_id=user_id, job_id=jd_id)

    prompt = f"""
    CANDIDATE RESUME FACTS:
    {resume_facts.model_dump_json(indent=2)}
    JOB DESCRIPTION:
    {refined_jd}
    {cover_letter_parser.get_format_instructions()}
    \n
    {SYSTEM_PROMPT_FOR_COVER_LETTER_GENERATION}
    """

    response = llm.invoke(prompt)
    generated = cover_letter_parser.parse(response.content)

    store.put(
        ("user", user_id, "cover_letter"),
        jd_id,
        {"data": generated.model_dump()}
    )

    return{"cover_letter": generated}

def generate_coverletter_docx_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    retrieve_cover_letter = store.get(("user", user_id, "cover_letter"), jd_id)
    raw_data = retrieve_cover_letter.value["data"]

    cover_letter = json.loads(raw_data) if isinstance(raw_data, str) else raw_data

    doc_bytes = build_coverletter_docx(cover_letter)

    out_dir = Path("./tmp")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{user_id}_{jd_id}_cover_letter.docx"

    with open(out_path, "wb") as f:
        f.write(doc_bytes)

    pages = get_docx_page_count(str(out_path))
    print(f"NO OF PAGES: {pages}")

    return {
        "cover_letter_docx_path": str(out_path),
        "page_count": pages 
        }

def shorten_coverletter_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    retrieve_cover_letter = store.get(("user", user_id, "cover_letter"), jd_id)
    raw_data = retrieve_cover_letter.value["data"]
    cover_letter = json.loads(raw_data) if isinstance(raw_data, str) else raw_data

    prompt = f"""
    {cover_letter_parser.get_format_instructions()}
    \n
    {SYSTEM_PROMPT_FOR_COVER_LETTER_SHORTENING}
    """

    response = llm.invoke([
        {"role": "system", "content": prompt},
        {"role": "user", "content": json.dumps(cover_letter)},
    ])

    shortened = cover_letter_parser.parse(response.content)
    shortened_dict = shortened.model_dump()

    store.put(("user", user_id, "cover_letter"), jd_id, {"data": shortened_dict})

    return {
        "cover_letter": shortened,
        "shorten_attempts": state.get("shorten_attempts", 0) + 1,
    }

def route_after_docx_generation(state: TailoredResumeState) -> str:
    """
    Conditional edge routing function. Runs after any node that (re)renders
    the cover letter docx. Sends the flow to `shorten_cover_letter` if the
    letter overflows past 1 page, capped at 2 shortening attempts to avoid
    an infinite loop if the LLM can't get it under a page.
    """
    pages = state.get("page_count", 1)
    attempts = state.get("shorten_attempts", 0)

    if pages > 1 and attempts < 2:
        return "shorten_cover_letter"
    return END

builder = StateGraph(TailoredResumeState)
builder.add_node('tailor_resume', tailor_resume_node)
builder.add_node('generate_resume', generate_resume_node)
builder.add_node('write_cover_letter', generate_coverletter_node)
builder.add_node('generate_cover_letter', generate_coverletter_docx_node)
builder.add_node('shorten_cover_letter', shorten_coverletter_node)

builder.add_edge(START, 'tailor_resume')
builder.add_edge('tailor_resume', 'generate_resume')
builder.add_edge('generate_resume', 'write_cover_letter')
builder.add_edge('write_cover_letter', 'generate_cover_letter')
builder.add_conditional_edges(
    "generate_cover_letter",
    route_after_docx_generation,
    {"shorten_cover_letter": "shorten_cover_letter", END: END},
)
builder.add_edge("shorten_cover_letter", "generate_cover_letter")

def generate_tailored_resume(user_id: str, jd_id: str) -> str:
    with PostgresStore.from_conn_string(DB_URI) as store:
        store.setup()
        graph = builder.compile(store=store)
        config = {"configurable": {"user_id": user_id, "jd_id": jd_id}}
        out = graph.invoke({}, config)
        print("GENERATED SUCCESSFULLY")

    return {
        "tailored_resume": out["tailored_resume"].model_dump_json(indent=2),
        "resume_docx_path": out["resume_docx_path"],
        "cover_letter": out["cover_letter"].model_dump_json(indent=2),
        "cover_letter_docx_path": out["cover_letter_docx_path"],
    }
generate_tailored_resume(user_id="u1", jd_id="jd1")
