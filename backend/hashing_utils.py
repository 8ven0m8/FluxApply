import hashlib
import re
import uuid


def _normalize(text: str) -> str:
    """Lowercase, strip whitespace, and collapse internal whitespace for stable hashing."""
    return re.sub(r"\s+", " ", text.strip().lower())


def generate_user_id(email: str) -> str:
    """
    Deterministic user_id from email. Same email always produces the same ID,
    so a returning user's resume_facts stay linked to them across sessions.
    Call this once at signup/login on the frontend and reuse it everywhere.
    """
    normalized = _normalize(email)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def generate_jd_id_from_url(url: str) -> str:
    """
    Deterministic jd_id from a job posting URL. Same URL always produces the
    same ID, so if the same job is submitted twice (by the same or different
    users), `get_refined_jd` can reuse the already-scraped/refined result
    instead of re-scraping and re-calling the LLM.

    Only call this when a URL is available BEFORE calling process_jd() —
    the returned id is used as both the jd_id (store key) and the LangGraph
    thread_id for the scrape/paste-interrupt flow.
    """
    normalized = _normalize(url)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def generate_jd_session_id() -> str:
    """
    Random jd_id for paste-only flows, where no URL exists yet to hash.
    Since process_jd/resume_with_paste require the SAME thread_id across
    both the initial call and the resume-after-paste call, this id must be
    generated up front (e.g. when the user opens the 'paste JD' box) and
    held by the frontend until the paste is submitted — it can't be derived
    from content that doesn't exist yet.
    """
    return uuid.uuid4().hex[:16]