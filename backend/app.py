"""
FastAPI layer over the existing pipeline:
- POST /users                     -> get/create a deterministic user_id from email
- POST /resume/upload              -> upload resume file, extract + store resume_facts
- POST /jd/submit                  -> submit a JD (url or pasted text), get refined_jd (or needs_paste)
- POST /jd/{jd_id}/paste           -> resume a needs_paste flow with pasted text
- POST /generate                   -> run the full tailoring graph, return S3 URLs

Run with: uvicorn api:app --reload
"""
from dotenv import load_dotenv
load_dotenv()
import tempfile
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone, timedelta  # <-- added

from os import getenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header, Depends
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hashing_utils import generate_user_id, generate_jd_id_from_url, generate_jd_session_id
from resume_extractor import process_resume
from jd_scraper import (
    process_jd,
    resume_with_paste,
    setup_checkpointer,
    open_checkpointer_pool,
    close_checkpointer_pool,
)
from tailored_content_generator import generate_tailored_resume, InputValidationError, LLMGenerationError
from langgraph.store.postgres import PostgresStore, PoolConfig
from schemas import RefinedJD, TailoredResumeContent, CoverLetter
from resume_docx_utils import extract_style_profile, build_resume_docx
from coverletter_docx_utils import build_coverletter_docx, get_docx_page_count
from s3_utils import upload_bytes_to_s3, s3_object_exists, generate_presigned_url, download_original_resume_bytes
from usage_tracking import (
    open_usage_pool,
    close_usage_pool,
    enforce_monthly_cap,
    get_monthly_usage,
    UsageLimitExceeded,
)
import razorpay
from razorpay.errors import SignatureVerificationError, BadRequestError

# NEW: import subscription utilities
from subscription_utils import (
    get_subscription,
    set_subscription,
    require_subscription,
    SubscriptionRequiredError,
    SUBSCRIPTION_EXEMPT_EMAILS,
    was_webhook_event_processed,
    mark_webhook_event_processed,
)

# ---------- Razorpay config ----------
RAZORPAY_KEY_ID = getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = getenv("RAZORPAY_WEBHOOK_SECRET")
RAZORPAY_PLAN_ID = getenv("RAZORPAY_PLAN_ID")   # the monthly plan ID

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def _assert_required_env() -> None:
    """
    Fail fast and loud at boot if a required secret is missing, instead of
    limping along with client = razorpay.Client(auth=(None, None)) and only
    discovering it three requests later as a cryptic 401 from Razorpay or a
    TypeError from verify_webhook_signature(secret=None).
    """
    missing = [
        name
        for name, value in [
            ("RAZORPAY_KEY_ID", RAZORPAY_KEY_ID),
            ("RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET),
            ("RAZORPAY_WEBHOOK_SECRET", RAZORPAY_WEBHOOK_SECRET),
            ("RAZORPAY_PLAN_ID", RAZORPAY_PLAN_ID),
            ("GOOGLE_CLIENT_ID", getenv("GOOGLE_CLIENT_ID")),
            ("DB_URI", DB_URI),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Set these before starting the app."
        )

    # MAX_RESUME_UPLOAD_BYTES is in raw bytes, not MB. The most common
    # misconfiguration is setting it to something like "10" meaning "10 MB"
    # — which silently becomes a 10-byte limit and shows users a nonsensical
    # "Max allowed size is 0 MB." error (integer division: 10 // 1048576 == 0).
    # Catch that at boot instead of shipping a broken upload limit.
    if MAX_RESUME_UPLOAD_BYTES < 1024 * 1024:
        raise RuntimeError(
            f"MAX_RESUME_UPLOAD_BYTES is set to {MAX_RESUME_UPLOAD_BYTES} bytes, which is "
            "under 1 MB and almost certainly a misconfiguration (this value is in bytes, "
            "not MB — e.g. use 10485760 for a 10 MB limit)."
        )

DB_URI = getenv("DB_URI")
logger = logging.getLogger(__name__)

# Tune via env if needed later; 10 is plenty for a single small instance and
# stays well under Postgres's default max_connections (100).
DB_POOL_MIN_SIZE = int(getenv("DB_POOL_MIN_SIZE", "1"))
DB_POOL_MAX_SIZE = int(getenv("DB_POOL_MAX_SIZE", "10"))

# Safety-net cap on $ spend per user per month, independent of whatever
# product-level plan limit (e.g. "N generations/month" for the ₹300 tier)
# you enforce elsewhere. This just stops a runaway/abusive user from costing
# real money even if the product-level limit has a bug. Generous on purpose —
# tighten once you've picked real plan tiers.
MONTHLY_USER_COST_CAP_USD = float(getenv("MONTHLY_USER_COST_CAP_USD", "2.00"))

# Resumes are PDFs/docx, not video files — 10 MB is generous for a text
# document. Enforced by streaming in chunks and aborting early, since
# Content-Length can be missing (chunked transfer) or spoofed, so it can't
# be trusted as the only check.
MAX_RESUME_UPLOAD_BYTES = int(getenv("MAX_RESUME_UPLOAD_BYTES", str(10 * 1024 * 1024)))
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB read chunks

# Job tracker: the small, deliberately-fixed set of states an application
# can be in. Kept as a flat set (not stored anywhere but here) since it's
# UI vocabulary, not domain data — changing it is a code change, not a
# migration.
ALLOWED_APPLICATION_STATUSES = {"not_applied", "applied", "interviewing", "offer", "rejected"}

########## Google O.Auth ##########
def get_verified_email(authorization: str = Header(default=None)) -> str:
    """
    Verifies the Google ID token sent as `Authorization: Bearer <token>` and
    returns the email Google vouches for. Every endpoint that touches user
    data depends on this instead of trusting a client-supplied user_id/email.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header. Sign in again.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(401, f"Invalid or expired Google ID token: {e}")

    if not claims.get("email_verified", False):
        raise HTTPException(401, "Google account email is not verified.")

    return claims["email"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Opens ONE pooled connection to Postgres for the lifetime of the process,
    instead of every route handler opening/closing its own connection.
    `PostgresStore.from_conn_string` is a context manager — entering it here
    (once) and holding it open via `yield` is what keeps the pool alive for
    the whole app instead of per-request. Same idea for the LangGraph
    checkpointer used by the JD-refinement graph (open_checkpointer_pool).
    """
    _assert_required_env()

    # Safe to call repeatedly — creates checkpoint tables if they don't exist yet.
    await setup_checkpointer()
    open_usage_pool()

    app.state.checkpointer = await open_checkpointer_pool(
        min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE
    )
    try:
        with PostgresStore.from_conn_string(
            DB_URI,
            pool_config=PoolConfig(min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE),
        ) as store:
            store.setup()  # safe to call repeatedly — creates store tables if missing
            app.state.store = store
            logger.info(
                "Postgres connection pools ready (min=%d, max=%d)",
                DB_POOL_MIN_SIZE, DB_POOL_MAX_SIZE,
            )
            yield
        # `with` block exit closes the store's pool cleanly on shutdown.
    finally:
        await close_checkpointer_pool()
        close_usage_pool()


app = FastAPI(title="Resume Tailoring API", lifespan=lifespan)
GOOGLE_CLIENT_ID = getenv("GOOGLE_CLIENT_ID")


def get_store(request: Request) -> PostgresStore:
    """Dependency that hands route handlers the single pooled store created at startup."""
    return request.app.state.store


def get_checkpointer(request: Request):
    """Dependency that hands route handlers the single pooled checkpointer created at startup."""
    return request.app.state.checkpointer


# Explicit origin whitelist — never use "*" here, since this API is
# session/cookie-authenticated and a wildcard would let any website read
# responses (resumes, tailored content, etc.) from a logged-in user's browser.
# Set FRONTEND_ORIGINS as a comma-separated list in prod, e.g.
#   FRONTEND_ORIGINS=https://fluxapply.com,https://www.fluxapply.com
_default_dev_origins = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in getenv("FRONTEND_ORIGINS", _default_dev_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


########## Centralized error handling ##########
# Registered once here so every endpoint gets consistent, parseable JSON
# error bodies instead of raw 500 stack traces leaking to the client.

@app.exception_handler(InputValidationError)
async def handle_input_validation_error(request: Request, exc: InputValidationError):
    return JSONResponse(status_code=422, content={"error": "input_validation_error", "detail": str(exc)})


@app.exception_handler(LLMGenerationError)
async def handle_llm_generation_error(request: Request, exc: LLMGenerationError):
    return JSONResponse(status_code=502, content={"error": "llm_generation_error", "detail": str(exc)})


@app.exception_handler(UsageLimitExceeded)
async def handle_usage_limit_exceeded(request: Request, exc: UsageLimitExceeded):
    return JSONResponse(status_code=429, content={"error": "usage_limit_exceeded", "detail": str(exc)})


@app.exception_handler(ValueError)
async def handle_value_error(request: Request, exc: ValueError):
    # Covers things like get_refined_jd()'s "not found" case, and other
    # deliberate ValueErrors raised for bad/missing input deeper in the pipeline.
    return JSONResponse(status_code=404, content={"error": "not_found", "detail": str(exc)})


@app.exception_handler(SubscriptionRequiredError)  # <-- fixed
async def handle_subscription_required(request: Request, exc: SubscriptionRequiredError):
    return JSONResponse(status_code=403, content={"error": "subscription_required", "detail": str(exc)})


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception):
    # Last-resort catch-all: never leak a raw stack trace to the client.
    # Full traceback still goes to your server logs via FastAPI's default logging.
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "Something went wrong processing this request."},
    )


########## /users ##########

class UserResponse(BaseModel):
    user_id: str

@app.post("/users", response_model=UserResponse)
def create_user(email: str = Depends(get_verified_email)):
    return UserResponse(user_id=generate_user_id(email))

########## /usage/me ##########

class UsageResponse(BaseModel):
    call_count: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    monthly_cap_usd: float

@app.get("/usage/me", response_model=UsageResponse)
def get_my_usage(email: str = Depends(get_verified_email)):
    """Current calendar month's LLM usage/cost for the calling user."""
    user_id = generate_user_id(email)
    usage = get_monthly_usage(user_id)
    return UsageResponse(**usage, monthly_cap_usd=MONTHLY_USER_COST_CAP_USD)


########## /resume/upload ##########

class ResumeUploadResponse(BaseModel):
    user_id: str
    resume_facts: str  # JSON string

@app.post("/resume/upload", response_model=ResumeUploadResponse)
def upload_resume(
    file: UploadFile = File(...),
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)
    require_subscription(store, user_id, email)  # <-- now imported
    enforce_monthly_cap(user_id, MONTHLY_USER_COST_CAP_USD)

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".docx"):
        raise HTTPException(400, f"Unsupported file type: {suffix}. Only .pdf and .docx allowed.")

    tmp_path: Optional[str] = None
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        total_bytes = 0
        while True:
            chunk = file.file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > MAX_RESUME_UPLOAD_BYTES:
                tmp.close()
                Path(tmp_path).unlink(missing_ok=True)
                raise HTTPException(
                    413,
                    f"Resume file too large. Max allowed size is "
                    f"{MAX_RESUME_UPLOAD_BYTES / (1024 * 1024):.1f} MB.",
                )
            tmp.write(chunk)

    try:
        # Preserve the original file in S3 — generate_resume_node needs this
        # later to copy the candidate's existing resume styling.
        content_type = (
            "application/pdf" if suffix == ".pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        with open(tmp_path, "rb") as f:
            upload_bytes_to_s3(f.read(), f"{user_id}/original_resume{suffix}", content_type=content_type)

        resume_facts_json = process_resume(tmp_path, user_id=user_id, store=store)
    except ValueError as e:
        raise HTTPException(400, f"Could not read resume file: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return ResumeUploadResponse(user_id=user_id, resume_facts=resume_facts_json)


########## /jd/submit ##########

class JDSubmitRequest(BaseModel):
    url: Optional[str] = None
    pasted_text: Optional[str] = None

class JDSubmitResponse(BaseModel):
    status: str  # "done" or "needs_paste"
    jd_id: str
    message: Optional[str] = None
    refined_jd: Optional[str] = None  # JSON string, present if status == "done"

@app.post("/jd/submit", response_model=JDSubmitResponse)
async def submit_jd(
    req: JDSubmitRequest,
    email: str = Depends(get_verified_email),
    checkpointer=Depends(get_checkpointer),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)
    require_subscription(store, user_id, email)
    enforce_monthly_cap(user_id, MONTHLY_USER_COST_CAP_USD)

    if not req.url and not req.pasted_text:
        raise HTTPException(400, "Provide either 'url' or 'pasted_text'.")

    if req.url:
        jd_id = generate_jd_id_from_url(req.url)
        target = process_jd(checkpointer, store, user_id=user_id, url=req.url, thread_id=jd_id)
    else:
        jd_id = generate_jd_session_id()
        target = process_jd(checkpointer, store, user_id=user_id, pasted_text=req.pasted_text, thread_id=jd_id)

    try:
        result = await target
    except Exception:
        logger.exception(
            "Failed to process job description (jd_id=%s, user_id=%s)", jd_id, user_id
        )
        raise HTTPException(
            502, "Failed to process the job description. Please try again shortly."
        )

    if result["status"] == "needs_paste":
        return JDSubmitResponse(status="needs_paste", jd_id=jd_id, message=result["message"])

    return JDSubmitResponse(
        status="done",
        jd_id=jd_id,
        refined_jd=result["refined_jd"].model_dump_json(indent=2),
    )


########## /jd/{jd_id}/paste ##########

class JDPasteRequest(BaseModel):
    pasted_text: str

class JDPasteResponse(BaseModel):
    status: str
    jd_id: str
    refined_jd: str  # JSON string

@app.post("/jd/{jd_id}/paste", response_model=JDPasteResponse)
async def paste_jd(
    jd_id: str,
    req: JDPasteRequest,
    email: str = Depends(get_verified_email),
    checkpointer=Depends(get_checkpointer),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)
    require_subscription(store, user_id, email)
    enforce_monthly_cap(user_id, MONTHLY_USER_COST_CAP_USD)
    result = await resume_with_paste(checkpointer, store, user_id=user_id, pasted_text=req.pasted_text, thread_id=jd_id)
    return JDPasteResponse(
        status="done",
        jd_id=jd_id,
        refined_jd=result["refined_jd"].model_dump_json(indent=2),
    )

########## /resume/status ##########

class ResumeStatusResponse(BaseModel):
    has_resume: bool

@app.get("/resume/status", response_model=ResumeStatusResponse)
def resume_status(email: str = Depends(get_verified_email), store: PostgresStore = Depends(get_store)):
    """
    Lets the frontend skip the upload step for returning users instead of
    asking for a resume on every visit.
    """
    user_id = generate_user_id(email)
    result = store.get(("user", user_id, "resume_facts"), "current")
    return ResumeStatusResponse(has_resume=result is not None)


########## /applications ##########

class ApplicationSummary(BaseModel):
    jd_id: str
    role_title: str
    company: str
    location: Optional[str] = None
    resume_docx_url: Optional[str] = None
    cover_letter_docx_url: Optional[str] = None
    status: str = "not_applied"

@app.get("/applications", response_model=list[ApplicationSummary])
def list_applications(email: str = Depends(get_verified_email), store: PostgresStore = Depends(get_store)):
    """
    Powers the sidebar — every JD this user has ever submitted, most recent
    first, with download links only where the generated files still exist
    (the S3 lifecycle rule deletes them after a few days).
    """
    user_id = generate_user_id(email)
    # search()'s default limit is 10 — override it, or applications
    # beyond the 10th most recently *written* silently disappear.
    items = store.search(("user", user_id, "refined_jds"), limit=200)
    statuses = {
        it.key: it.value["data"]["status"]
        for it in store.search(("user", user_id, "application_status"), limit=200)
    }

    items = sorted(items, key=lambda it: it.updated_at, reverse=True)

    applications = []
    for item in items:
        jd_id = item.key
        refined = RefinedJD.model_validate(item.value["data"])

        resume_key = f"{user_id}/{jd_id}_resume.docx"
        cover_letter_key = f"{user_id}/{jd_id}_cover_letter.docx"

        applications.append(ApplicationSummary(
            jd_id=jd_id,
            role_title=refined.role_title,
            company=refined.company,
            location=refined.location,
            resume_docx_url=generate_presigned_url(resume_key) if s3_object_exists(resume_key) else None,
            cover_letter_docx_url=generate_presigned_url(cover_letter_key) if s3_object_exists(cover_letter_key) else None,
            status=statuses.get(jd_id, "not_applied"),
        ))

    return applications


########## /applications/{jd_id}/status ##########

class ApplicationStatusRequest(BaseModel):
    status: str

class ApplicationStatusResponse(BaseModel):
    jd_id: str
    status: str

@app.put("/applications/{jd_id}/status", response_model=ApplicationStatusResponse)
def set_application_status(
    jd_id: str,
    req: ApplicationStatusRequest,
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    """
    Job tracker: lets the user mark where an application actually stands
    (applied / interviewing / offer / rejected) independent of whether the
    resume/cover-letter files still exist. Stored in the same PostgresStore
    the rest of the app already uses — a new namespace, no new
    infrastructure.
    """
    if req.status not in ALLOWED_APPLICATION_STATUSES:
        raise HTTPException(
            400, f"status must be one of {sorted(ALLOWED_APPLICATION_STATUSES)}, got {req.status!r}."
        )

    user_id = generate_user_id(email)
    if store.get(("user", user_id, "refined_jds"), jd_id) is None:
        raise HTTPException(404, f"No application found for jd_id={jd_id!r}.")
    store.put(("user", user_id, "application_status"), jd_id, {"data": {"status": req.status}})

    return ApplicationStatusResponse(jd_id=jd_id, status=req.status)

########## /resume/{jd_id}/content ##########
# Read-only fetch of already-stored tailored resume content — lets the
# editor open a *past* application (selected from the sidebar) without
# re-running /generate, which would re-invoke the LLM and overwrite any
# prior edits.

class ResumeContentResponse(BaseModel):
    tailored_resume: str  # JSON string

@app.get("/resume/{jd_id}/content", response_model=ResumeContentResponse)
def get_resume_content(
    jd_id: str, email: str = Depends(get_verified_email), store: PostgresStore = Depends(get_store)
):
    user_id = generate_user_id(email)
    result = store.get(("user", user_id, "tailored_resumes"), jd_id)
    if result is None:
        raise HTTPException(404, f"No tailored resume found for jd_id={jd_id!r}. Generate it first.")
    return ResumeContentResponse(tailored_resume=json.dumps(result.value["data"]))


########## /cover-letter/{jd_id}/content ##########

class CoverLetterContentResponse(BaseModel):
    cover_letter: str  # JSON string

@app.get("/cover-letter/{jd_id}/content", response_model=CoverLetterContentResponse)
def get_cover_letter_content(
    jd_id: str, email: str = Depends(get_verified_email), store: PostgresStore = Depends(get_store)
):
    user_id = generate_user_id(email)
    result = store.get(("user", user_id, "cover_letter"), jd_id)
    if result is None:
        raise HTTPException(404, f"No cover letter found for jd_id={jd_id!r}. Generate it first.")
    data = result.value["data"]
    # generate_coverletter_docx_node/shorten_coverletter_node store this
    # pre-serialized in some code paths — same defensive check they use.
    return CoverLetterContentResponse(cover_letter=data if isinstance(data, str) else json.dumps(data))


########## /generate ##########

class GenerateRequest(BaseModel):
    jd_id: str

class GenerateResponse(BaseModel):
    tailored_resume: str
    resume_docx_url: str
    cover_letter: str
    cover_letter_docx_url: str

@app.post("/generate", response_model=GenerateResponse)
def generate(
    req: GenerateRequest, email: str = Depends(get_verified_email), store: PostgresStore = Depends(get_store)
):
    user_id = generate_user_id(email)
    require_subscription(store, user_id, email)
    enforce_monthly_cap(user_id, MONTHLY_USER_COST_CAP_USD)
    result = generate_tailored_resume(user_id=user_id, jd_id=req.jd_id, store=store)
    return GenerateResponse(**result)


########## /resume/{jd_id}/render ##########
# Powers "edit before download": the editor works on the same structured
# content /generate already returns (TailoredResumeContent), and this just
# re-runs the existing deterministic docx-formatting step on it — no LLM
# call, so edits render back exactly as typed, and it's cheap enough to
# call on every save.

class ResumeRenderResponse(BaseModel):
    tailored_resume: str  # JSON string, echoes back what was saved
    resume_docx_url: str

@app.put("/resume/{jd_id}/render", response_model=ResumeRenderResponse)
def render_resume(
    jd_id: str,
    content: TailoredResumeContent,
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)
    require_subscription(store, user_id, email)  # <-- added

    store.put(("user", user_id, "tailored_resumes"), jd_id, {"data": content.model_dump()})

    try:
        original_bytes = download_original_resume_bytes(user_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    style = extract_style_profile(original_bytes)
    doc_bytes = build_resume_docx(content.model_dump(), style)

    s3_key = f"{user_id}/{jd_id}_resume.docx"
    upload_bytes_to_s3(doc_bytes, s3_key, tags={"ephemeral": "true"})

    return ResumeRenderResponse(
        tailored_resume=content.model_dump_json(indent=2),
        resume_docx_url=generate_presigned_url(s3_key),
    )


########## /cover-letter/{jd_id}/render ##########

class CoverLetterRenderResponse(BaseModel):
    cover_letter: str  # JSON string, echoes back what was saved
    cover_letter_docx_url: str
    page_count: int

@app.put("/cover-letter/{jd_id}/render", response_model=CoverLetterRenderResponse)
def render_cover_letter(
    jd_id: str,
    content: CoverLetter,
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)
    require_subscription(store, user_id, email)  # <-- added

    store.put(("user", user_id, "cover_letter"), jd_id, {"data": content.model_dump()})

    doc_bytes = build_coverletter_docx(content.model_dump())

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(doc_bytes)
        tmp_path = tmp.name
    try:
        pages = get_docx_page_count(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    # Deliberately NOT auto-shortening here even if pages > 1 — that's the
    # LLM rewriting a paragraph the user just hand-edited, which would
    # silently undo their change. page_count is returned so the frontend
    # can warn instead, and let the user trim it themselves.
    s3_key = f"{user_id}/{jd_id}_cover_letter.docx"
    upload_bytes_to_s3(doc_bytes, s3_key, tags={"ephemeral": "true"})

    return CoverLetterRenderResponse(
        cover_letter=content.model_dump_json(indent=2),
        cover_letter_docx_url=generate_presigned_url(s3_key),
        page_count=pages,
    )

###### Razorpay endpoints ########
class CreateSubscriptionRequest(BaseModel):
    success_url: str
    cancel_url: str

class CreateSubscriptionResponse(BaseModel):
    subscription_id: str
    key_id: str

@app.post("/subscription/create", response_model=CreateSubscriptionResponse)
def create_subscription(
    req: CreateSubscriptionRequest,
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)

    # ---- Helper: get (or create) the Razorpay customer for this email ----
    def get_customer_id_for_email(email: str) -> str:
        # 1. Look up existing customer by email
        existing = client.customer.all({"email": email})
        if existing.get("count", 0) > 0:
            return existing["items"][0]["id"]
        # 2. Create a new customer
        try:
            customer = client.customer.create({
                "email": email,
                "name": email.split("@")[0],
                "notes": {"user_id": user_id}
            })
            return customer["id"]
        except BadRequestError as e:
            # Rare race: created elsewhere between our lookup and this call.
            # Fall back to a second lookup.
            if "Customer already exists" in str(e):
                retry = client.customer.all({"email": email})
                if retry.get("count", 0) > 0:
                    return retry["items"][0]["id"]
            raise HTTPException(400, f"Razorpay customer creation failed: {e}")

    # The CORRECT customer ID derived from the authenticated email
    correct_customer_id = get_customer_id_for_email(email)

    # ---- Check for an existing subscription, but verify its customer ----
    sub_info = get_subscription(store, user_id)
    existing_sub_id = sub_info.get("razorpay_subscription_id")

    if sub_info.get("active") and existing_sub_id:
        # Fetch the subscription from Razorpay to confirm its customer
        try:
            sub_details = client.subscription.fetch(existing_sub_id)
            sub_customer_id = sub_details.get("customer_id")
            # If the subscription's customer matches the correct one, we can reuse it
            if sub_customer_id == correct_customer_id:
                # Check that it's still valid (not expired)
                current_end = sub_details.get("current_end")
                if current_end:
                    expires_at = datetime.fromtimestamp(current_end, tz=timezone.utc)
                    if expires_at >= datetime.now(timezone.utc):
                        return CreateSubscriptionResponse(
                            subscription_id=existing_sub_id,
                            key_id=RAZORPAY_KEY_ID,
                        )
        except Exception:
            # If fetch fails, treat as invalid
            pass

        # ---- (Optional) Cancel the old subscription to avoid double billing ----
        # If we reach here, the existing subscription is either expired, belongs
        # to a different customer, or we couldn't fetch it. To be safe, we
        # schedule cancellation at period end if it's still active.
        try:
            client.subscription.cancel(existing_sub_id, {"cancel_at_cycle_end": 1})
            logger.info("Cancelled old subscription %s for user %s", existing_sub_id, user_id)
        except Exception:
            pass  # Ignore errors; the old subscription will eventually expire

    # ---- Create a NEW subscription with the correct customer ----
    try:
        subscription = client.subscription.create({
            "plan_id": RAZORPAY_PLAN_ID,
            "customer_id": correct_customer_id,
            "total_count": 12,
            "quantity": 1,
            "notes": {"user_id": user_id},
            "notify_info": {
                "notify_phone": False,
                "notify_email": True,
            },
        })
    except BadRequestError as e:
        raise HTTPException(400, f"Razorpay subscription creation failed: {e}")

    # ---- Store the subscription details (overwrites any stale data) ----
    set_subscription(
        store,
        user_id,
        active=False,
        razorpay_subscription_id=subscription["id"],
        razorpay_customer_id=correct_customer_id,  # always store the correct one
        plan_id=RAZORPAY_PLAN_ID,
        expires_at=None,
    )

    return CreateSubscriptionResponse(
        subscription_id=subscription["id"],
        key_id=RAZORPAY_KEY_ID,
    )

class SubscriptionStatusResponse(BaseModel):
    active: bool
    expires_at: Optional[str]
    razorpay_subscription_id: Optional[str]
    razorpay_customer_id: Optional[str]
    plan_id: Optional[str]
    cancel_at_period_end: bool = False

@app.get("/subscription/status", response_model=SubscriptionStatusResponse)
def subscription_status(
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    user_id = generate_user_id(email)
    sub = get_subscription(store, user_id)

    # Exempt accounts (e.g. your own test/admin accounts) get free access
    # regardless of whatever's stored for them, and are not billed through
    # Razorpay — /subscription/cancel explicitly refuses these emails. So
    # besides marking active with a far-future expiry, also clear out any
    # Razorpay-specific fields. Without this, an account that had a real
    # test subscription before being added to the exempt list would keep
    # showing a "Cancel subscription" button (from leftover
    # razorpay_subscription_id in the store) that errors when clicked,
    # while an account that never subscribed correctly shows no button —
    # same exemption, inconsistent UI, purely because of what happened to
    # be in the store beforehand.
    if email in SUBSCRIPTION_EXEMPT_EMAILS:
        sub["active"] = True
        sub["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
        sub["razorpay_subscription_id"] = None
        sub["razorpay_customer_id"] = None
        sub["cancel_at_period_end"] = False

    return SubscriptionStatusResponse(**sub)

@app.post("/subscription/cancel", response_model=SubscriptionStatusResponse)
def cancel_subscription(
    email: str = Depends(get_verified_email),
    store: PostgresStore = Depends(get_store),
):
    """
    Schedules the caller's Razorpay subscription to stop renewing at the
    end of the current billing period, rather than cutting access off
    immediately — the user already paid for this period, so they keep
    access through `expires_at` and simply aren't charged again after that.

    Unlike /subscription/create's webhook-only pattern, it's fine to update
    our own store synchronously here (not wait for a webhook): this isn't
    inferring anything from an untrusted client callback, it's reading the
    direct, authoritative response from our own server-to-server call to
    Razorpay's cancel API. The actual final deactivation at period end
    still goes through the "subscription.cancelled" webhook, same as
    always — this endpoint only sets the "won't renew" flag early so the
    UI can reflect it right away.
    """
    if email in SUBSCRIPTION_EXEMPT_EMAILS:
        raise HTTPException(400, "This account isn't billed through Razorpay.")

    user_id = generate_user_id(email)
    sub_info = get_subscription(store, user_id)
    subscription_id = sub_info.get("razorpay_subscription_id")
    if not subscription_id or not sub_info.get("active"):
        raise HTTPException(400, "No active subscription to cancel.")
    if sub_info.get("cancel_at_period_end"):
        # Already scheduled — nothing new to do, just return current state.
        return SubscriptionStatusResponse(**sub_info)

    try:
        # cancel_at_cycle_end=1: don't cancel now, let the current period
        # run out, then stop renewing. Razorpay fires "subscription.cancelled"
        # at that point, which is what our webhook handler uses to finally
        # flip `active` to False.
        client.subscription.cancel(subscription_id, {"cancel_at_cycle_end": 1})
    except BadRequestError as e:
        raise HTTPException(400, f"Razorpay subscription cancellation failed: {e}")

    set_subscription(
        store,
        user_id,
        active=True,
        expires_at=datetime.fromisoformat(sub_info["expires_at"]) if sub_info.get("expires_at") else None,
        razorpay_subscription_id=subscription_id,
        razorpay_customer_id=sub_info.get("razorpay_customer_id"),
        plan_id=sub_info.get("plan_id"),
        cancel_at_period_end=True,
    )

    logger.info(
        "Cancellation scheduled for user %s (subscription %s), effective at period end",
        user_id, subscription_id,
    )
    return SubscriptionStatusResponse(**get_subscription(store, user_id))

@app.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    raw_payload = await request.body()
    sig_header = request.headers.get("x-razorpay-signature")
    if not sig_header:
        raise HTTPException(400, "Missing x-razorpay-signature header")

    # Decode defensively: a malformed body should surface as a clean 400,
    # not a 500 from an unhandled UnicodeDecodeError.
    try:
        payload = raw_payload.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Payload is not valid UTF-8")

    # Verify signature
    try:
        client.utility.verify_webhook_signature(
            payload,
            sig_header,
            RAZORPAY_WEBHOOK_SECRET,
        )
    except SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    event = json.loads(payload)
    event_type = event.get("event")
    payload_data = event.get("payload", {})
    store: PostgresStore = request.app.state.store

    # Idempotency: Razorpay redelivers events (timeouts, retries after a
    # slow-but-successful 2xx, etc.), and our handlers are not all safely
    # replayable — e.g. a stale "activated" event replayed after a later,
    # legitimate "cancelled" would silently reactivate the user. Every
    # Razorpay webhook payload carries a unique top-level "id"; skip
    # anything we've already processed.
    event_id = event.get("id")
    if was_webhook_event_processed(store, event_id):
        logger.info("Ignoring duplicate/replayed webhook event %s (%s)", event_id, event_type)
        return {"status": "duplicate_ignored"}

    if event_type == "subscription.activated":
        # First successful payment – activate subscription
        sub = payload_data.get("subscription", {}).get("entity", {})
        subscription_id = sub.get("id")
        user_id = sub.get("notes", {}).get("user_id")
        if not user_id or not subscription_id:
            return {"status": "ignored"}

        # Get subscription details to know expiry (current_end is in Unix timestamp)
        try:
            sub_details = client.subscription.fetch(subscription_id)
            current_end = sub_details.get("current_end")  # Unix timestamp
            expires_at = datetime.fromtimestamp(current_end, tz=timezone.utc)
        except Exception:
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)

        set_subscription(
            store,
            user_id,
            active=True,
            expires_at=expires_at,
            razorpay_subscription_id=subscription_id,
            razorpay_customer_id=sub.get("customer_id"),
            plan_id=sub.get("plan_id"),
        )
        logger.info("Subscription activated for user %s", user_id)

    elif event_type == "subscription.charged":
        # Renewal payment succeeded – extend expiry
        sub = payload_data.get("subscription", {}).get("entity", {})
        subscription_id = sub.get("id")
        user_id = sub.get("notes", {}).get("user_id")
        if not user_id or not subscription_id:
            return {"status": "ignored"}

        try:
            sub_details = client.subscription.fetch(subscription_id)
            current_end = sub_details.get("current_end")
            expires_at = datetime.fromtimestamp(current_end, tz=timezone.utc)
        except Exception:
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)

        current = get_subscription(store, user_id)
        set_subscription(
            store,
            user_id,
            active=True,
            expires_at=expires_at,
            razorpay_subscription_id=subscription_id,
            razorpay_customer_id=current.get("razorpay_customer_id"),
            plan_id=current.get("plan_id"),
        )
        logger.info("Subscription renewed for user %s", user_id)

    elif event_type == "subscription.cancelled":
        sub = payload_data.get("subscription", {}).get("entity", {})
        subscription_id = sub.get("id")
        user_id = sub.get("notes", {}).get("user_id")
        if not user_id or not subscription_id:
            return {"status": "ignored"}

        set_subscription(
            store,
            user_id,
            active=False,
            expires_at=None,
            razorpay_subscription_id=subscription_id,
            razorpay_customer_id=None,
            plan_id=None,
        )
        logger.info("Subscription cancelled for user %s", user_id)

    elif event_type in ("subscription.halted", "subscription.paused"):
        # "halted" is Razorpay's terminal state after retries on a renewal
        # payment are exhausted — the customer's card is failing and
        # Razorpay has given up trying. Previously unhandled, which meant a
        # user in this state stayed "active" in our own store until the old
        # `expires_at` happened to pass, i.e. free access during the whole
        # dunning window. "paused" is the same idea for a merchant-initiated
        # pause. Both mean: access should stop now, not at the old expiry.
        sub = payload_data.get("subscription", {}).get("entity", {})
        subscription_id = sub.get("id")
        user_id = sub.get("notes", {}).get("user_id")
        if not user_id or not subscription_id:
            return {"status": "ignored"}

        current = get_subscription(store, user_id)
        set_subscription(
            store,
            user_id,
            active=False,
            expires_at=None,
            razorpay_subscription_id=subscription_id,
            razorpay_customer_id=current.get("razorpay_customer_id"),
            plan_id=current.get("plan_id"),
        )
        logger.info("Subscription %s for user %s", event_type.split(".")[-1], user_id)

    elif event_type == "payment.failed":
        # A failed renewal charge on its own doesn't necessarily mean the
        # subscription is dead yet (Razorpay retries before halting it), so
        # we don't deactivate here — that's what subscription.halted is for.
        # Just log it so failed renewals are visible/debuggable.
        payment = payload_data.get("payment", {}).get("entity", {})
        logger.warning(
            "Razorpay payment failed: payment_id=%s error=%s",
            payment.get("id"),
            payment.get("error_description"),
        )

    mark_webhook_event_processed(store, event_id, event_type)
    return {"status": "success"}