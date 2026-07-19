from schemas import ResumeFact, TailoredResumeContent, CoverLetter
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import PydanticOutputParser
from jd_scraper import get_refined_jd
from typing import TypedDict, Optional, List, TypeVar
from os import getenv, remove
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
import logging
import boto3
import tempfile
from botocore.exceptions import ClientError
from s3_utils import generate_presigned_url, s3_uri_to_key, upload_bytes_to_s3, download_original_resume_bytes
from usage_tracking import log_llm_usage

load_dotenv()
logger = logging.getLogger(__name__)

DB_URI=getenv("DB_URI")

llm = ChatOpenAI(
    # base_url=getenv("FREELLMAPI_URL"),
    api_key=getenv("OPENAI_KEY"),
    model="gpt-4o-mini"
)

########### Error handling helper functions ###########
class LLMGenerationError(Exception):
    """Raised when an LLM call + parse fails after all retry attempts."""
    pass

class InputValidationError(Exception):
    """Raised when required input data (resume facts, JD) is missing for the given IDs."""
    pass


T = TypeVar("T")


def invoke_and_parse_with_retry(
    messages,
    parser: PydanticOutputParser,
    *,
    max_attempts: int = 3,
    node_name: str = "unknown_node",
    user_id: str = "unknown",
    endpoint: str = "generate",
) -> T:
    """
    Calls llm.invoke(messages) and parses the response with `parser`,
    retrying on failure (malformed JSON, schema validation errors, API
    errors, etc). Raises LLMGenerationError if all attempts fail.

    `messages` can be either a raw prompt string or a list of
    {"role": ..., "content": ...} dicts — whatever `llm.invoke` accepts.

    Every attempt (including failed/retried ones) is logged via
    log_llm_usage — a retry still costs real tokens, so it should still
    count toward the user's usage.
    """
    last_error: Optional[Exception] = None

    for attempt in range(1, max_attempts + 1):
        try:
            response = llm.invoke(messages)
            log_llm_usage(user_id=user_id, endpoint=endpoint, node_name=node_name, ai_message=response)
            parsed = parser.parse(response.content)
            return parsed
        except Exception as e:
            last_error = e
            logger.warning(
                "[%s] LLM invoke/parse attempt %d/%d failed: %s",
                node_name, attempt, max_attempts, e,
            )

    raise LLMGenerationError(
        f"[{node_name}] Failed to generate valid output after {max_attempts} attempts. "
        f"Last error: {last_error}"
    ) from last_error


########### Main state ##############
class TailoredResumeState(TypedDict):
    tailored_resume: Optional[TailoredResumeContent]
    resume_docx_path: Optional[str]
    resume_docx_url: Optional[str]
    cover_letter: Optional[CoverLetter]
    cover_letter_docx_path: Optional[str]
    cover_letter_docx_url: Optional[str]
    page_count: Optional[int]
    shorten_attempts: Optional[int]


tailor_resume_parser = PydanticOutputParser(pydantic_object=TailoredResumeContent)
cover_letter_parser = PydanticOutputParser(pydantic_object=CoverLetter)

############## Nodes ###############
def validate_input_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    result = store.get(("user", user_id, "resume_facts"), "current")
    if result is None:
        raise InputValidationError(
            f"No resume facts found for user_id={user_id!r}. "
            f"Has this user uploaded/parsed a resume yet?"
        )

    try:
        ResumeFact.model_validate(result.value["data"])
    except Exception as e:
        raise InputValidationError(
            f"Stored resume facts for user_id={user_id!r} failed schema validation: {e}"
        ) from e

    try:
        refined_jd = get_refined_jd(store, user_id=user_id, job_id=jd_id)
    except Exception as e:
        raise InputValidationError(
            f"Failed to fetch/refine job description for jd_id={jd_id!r}, user_id={user_id!r}: {e}"
        ) from e

    if refined_jd is None:
        raise InputValidationError(
            f"No job description found for jd_id={jd_id!r}. "
            f"Has this JD been scraped/refined yet?"
        )

    logger.info("Input validation passed for user_id=%s, jd_id=%s", user_id, jd_id)
    return {}

def tailor_resume_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    result = store.get(("user", user_id, "resume_facts"), "current")
    resume_facts = ResumeFact.model_validate(result.value["data"])
    refined_jd = get_refined_jd(store, user_id=user_id, job_id=jd_id)

    prompt = f"""
    Resume facts:
    {resume_facts.model_dump_json(indent=2)}
    Job description:
    {refined_jd.model_dump_json(indent=2)}
    {tailor_resume_parser.get_format_instructions()}
    \n
    {SYSTEM_PROMPT_FOR_TAILORING_RESUME}
    """

    tailored = invoke_and_parse_with_retry(
        prompt,
        tailor_resume_parser,
        node_name="tailor_resume_node",
        user_id=user_id,
        endpoint="generate",
    )

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

    original_bytes = download_original_resume_bytes(user_id)
    style = extract_style_profile(original_bytes)
    doc_bytes = build_resume_docx(tailored_resume, style)

    s3_key = f"{user_id}/{jd_id}_resume.docx"
    s3_uri = upload_bytes_to_s3(doc_bytes, s3_key, tags={"ephemeral": "true"})

    return {"resume_docx_path": s3_uri}


def generate_coverletter_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    result = store.get(("user", user_id, "resume_facts"), "current")
    resume_facts = ResumeFact.model_validate(result.value["data"])
    refined_jd = get_refined_jd(store, user_id=user_id, job_id=jd_id)

    prompt = f"""
    CANDIDATE RESUME FACTS:
    {resume_facts.model_dump_json(indent=2)}
    JOB DESCRIPTION:
    {refined_jd}
    {cover_letter_parser.get_format_instructions()}
    \n
    {SYSTEM_PROMPT_FOR_COVER_LETTER_GENERATION}
    """

    generated = invoke_and_parse_with_retry(
        prompt,
        cover_letter_parser,
        node_name="generate_coverletter_node",
        user_id=user_id,
        endpoint="generate",
    )

    store.put(
        ("user", user_id, "cover_letter"),
        jd_id,
        {"data": generated.model_dump()}
    )

    return {"cover_letter": generated}


def generate_coverletter_docx_node(state: TailoredResumeState, config: RunnableConfig, *, store: BaseStore):
    user_id = config["configurable"]["user_id"]
    jd_id = config["configurable"]["jd_id"]

    retrieve_cover_letter = store.get(("user", user_id, "cover_letter"), jd_id)
    raw_data = retrieve_cover_letter.value["data"]

    cover_letter = json.loads(raw_data) if isinstance(raw_data, str) else raw_data

    doc_bytes = build_coverletter_docx(cover_letter)

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(doc_bytes)
        tmp_path = tmp.name

    try:
        pages = get_docx_page_count(tmp_path)
    finally:
        remove(tmp_path)

    s3_key = f"{user_id}/{jd_id}_cover_letter.docx"
    s3_uri = upload_bytes_to_s3(doc_bytes, s3_key, tags={"ephemeral": "true"})

    return {
        "cover_letter_docx_path": s3_uri,
        "page_count": pages,
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

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": json.dumps(cover_letter)},
    ]

    shortened = invoke_and_parse_with_retry(
        messages,
        cover_letter_parser,
        node_name="shorten_coverletter_node",
        user_id=user_id,
        endpoint="generate",
    )
    shortened_dict = shortened.model_dump()

    store.put(("user", user_id, "cover_letter"), jd_id, {"data": shortened_dict})

    return {
        "cover_letter": shortened,
        "shorten_attempts": state.get("shorten_attempts", 0) + 1,
    }

# Conditional node
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
builder.add_node('validate_input', validate_input_node)
builder.add_node('tailor_resume', tailor_resume_node)
builder.add_node('generate_resume', generate_resume_node)
builder.add_node('write_cover_letter', generate_coverletter_node)
builder.add_node('generate_cover_letter', generate_coverletter_docx_node)
builder.add_node('shorten_cover_letter', shorten_coverletter_node)

builder.add_edge(START, 'validate_input')
builder.add_edge('validate_input', 'tailor_resume')
builder.add_edge('tailor_resume', 'generate_resume')
builder.add_edge('generate_resume', 'write_cover_letter')
builder.add_edge('write_cover_letter', 'generate_cover_letter')
builder.add_conditional_edges(
    "generate_cover_letter",
    route_after_docx_generation,
    {"shorten_cover_letter": "shorten_cover_letter", END: END},
)
builder.add_edge("shorten_cover_letter", "generate_cover_letter")

# main function
def generate_tailored_resume(user_id: str, jd_id: str, store: BaseStore) -> dict:
    """
    `store` is the single pooled PostgresStore created once at app startup
    and injected by the caller (see app.py's `get_store` dependency) —
    this function no longer opens its own Postgres connection per call.
    """
    graph = builder.compile(store=store)
    config = {"configurable": {"user_id": user_id, "jd_id": jd_id}}
    try:
        out = graph.invoke({}, config)
    except InputValidationError as e:
        logger.error("Input validation failed: %s", e)
        raise
    print("GENERATED SUCCESSFULLY")

    resume_key = s3_uri_to_key(out["resume_docx_path"])
    cover_letter_key = s3_uri_to_key(out["cover_letter_docx_path"])
    # resume_docx_url = generate_presigned_url(resume_key)
    # print(resume_docx_url)
    # cover_letter_docx_url = generate_presigned_url(cover_letter_key)
    # print(cover_letter_docx_url)

    return {
        "tailored_resume": out["tailored_resume"].model_dump_json(indent=2),
        "resume_docx_url": generate_presigned_url(resume_key),
        "cover_letter": out["cover_letter"].model_dump_json(indent=2),
        "cover_letter_docx_url": generate_presigned_url(cover_letter_key),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate a tailored resume + cover letter for a given user/JD.")
    parser.add_argument("--user_id", required=True, help="user_id printed by input.py")
    parser.add_argument("--jd_id", required=True, help="jd_id printed by input.py")
    args = parser.parse_args()

    result = generate_tailored_resume(user_id=args.user_id, jd_id=args.jd_id)
    print("\nResume URL:", result["resume_docx_url"])
    print("\nCover letter URL:", result["cover_letter_docx_url"])