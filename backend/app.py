"""
FastAPI layer over the existing pipeline:
- POST /users                     -> get/create a deterministic user_id from email
- POST /resume/upload              -> upload resume file, extract + store resume_facts
- POST /jd/submit                  -> submit a JD (url or pasted text), get refined_jd (or needs_paste)
- POST /jd/{jd_id}/paste           -> resume a needs_paste flow with pasted text
- POST /generate                   -> run the full tailoring graph, return S3 URLs

Run with: uvicorn api:app --reload
"""

import shutil
import tempfile
from pathlib import Path
from typing import Optional

from os import getenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header, Depends
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hashing_utils import generate_user_id, generate_jd_id_from_url, generate_jd_session_id
from resume_extractor import process_resume
from jd_scraper import process_jd, resume_with_paste, setup_checkpointer
from tailored_content_generator import generate_tailored_resume, InputValidationError, LLMGenerationError
from langgraph.store.postgres import PostgresStore
from schemas import RefinedJD
from s3_utils import upload_bytes_to_s3, s3_object_exists, generate_presigned_url

DB_URI = getenv("DB_URI")

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

app = FastAPI(title="Resume Tailoring API")
GOOGLE_CLIENT_ID = getenv("GOOGLE_CLIENT_ID")

# Adjust to your actual frontend origin before going to prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.exception_handler(ValueError)
async def handle_value_error(request: Request, exc: ValueError):
    # Covers things like get_refined_jd()'s "not found" case, and other
    # deliberate ValueErrors raised for bad/missing input deeper in the pipeline.
    return JSONResponse(status_code=404, content={"error": "not_found", "detail": str(exc)})


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception):
    # Last-resort catch-all: never leak a raw stack trace to the client.
    # Full traceback still goes to your server logs via FastAPI's default logging.
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "Something went wrong processing this request."},
    )


@app.on_event("startup")
async def startup():
    # Safe to call repeatedly — creates checkpoint tables if they don't exist yet.
    await setup_checkpointer()


########## /users ##########

class UserResponse(BaseModel):
    user_id: str

@app.post("/users", response_model=UserResponse)
def create_user(email: str = Depends(get_verified_email)):
    return UserResponse(user_id=generate_user_id(email))

########## /resume/upload ##########

class ResumeUploadResponse(BaseModel):
    user_id: str
    resume_facts: str  # JSON string

@app.post("/resume/upload", response_model=ResumeUploadResponse)
def upload_resume(file: UploadFile = File(...), email: str = Depends(get_verified_email)):
    user_id = generate_user_id(email)
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".docx"):
        raise HTTPException(400, f"Unsupported file type: {suffix}. Only .pdf and .docx allowed.")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Preserve the original file in S3 — generate_resume_node needs this
        # later to copy the candidate's existing resume styling.
        content_type = (
            "application/pdf" if suffix == ".pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        with open(tmp_path, "rb") as f:
            upload_bytes_to_s3(f.read(), f"{user_id}/original_resume{suffix}", content_type=content_type)

        resume_facts_json = process_resume(tmp_path, user_id=user_id)
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
async def submit_jd(req: JDSubmitRequest, email: str = Depends(get_verified_email)):
    user_id = generate_user_id(email)

    if not req.url and not req.pasted_text:
        raise HTTPException(400, "Provide either 'url' or 'pasted_text'.")

    if req.url:
        jd_id = generate_jd_id_from_url(req.url)
        target = process_jd(user_id=user_id, url=req.url, thread_id=jd_id)
    else:
        jd_id = generate_jd_session_id()
        target = process_jd(user_id=user_id, pasted_text=req.pasted_text, thread_id=jd_id)

    try:
        result = await target
    except Exception as e:
        raise HTTPException(502, f"Failed to process job description: {e}")

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
async def paste_jd(jd_id: str, req: JDPasteRequest, email: str = Depends(get_verified_email)):
    user_id = generate_user_id(email)
    result = await resume_with_paste(user_id=user_id, pasted_text=req.pasted_text, thread_id=jd_id)
    return JDPasteResponse(
        status="done",
        jd_id=jd_id,
        refined_jd=result["refined_jd"].model_dump_json(indent=2),
    )

########## /resume/status ##########

class ResumeStatusResponse(BaseModel):
    has_resume: bool

@app.get("/resume/status", response_model=ResumeStatusResponse)
def resume_status(email: str = Depends(get_verified_email)):
    """
    Lets the frontend skip the upload step for returning users instead of
    asking for a resume on every visit.
    """
    user_id = generate_user_id(email)
    with PostgresStore.from_conn_string(DB_URI) as store:
        store.setup()
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

@app.get("/applications", response_model=list[ApplicationSummary])
def list_applications(email: str = Depends(get_verified_email)):
    """
    Powers the sidebar — every JD this user has ever submitted, most recent
    first, with download links only where the generated files still exist
    (the S3 lifecycle rule deletes them after a few days).
    """
    user_id = generate_user_id(email)
    with PostgresStore.from_conn_string(DB_URI) as store:
        store.setup()
        # search()'s default limit is 10 — override it, or applications
        # beyond the 10th most recently *written* silently disappear.
        items = store.search(("user", user_id, "refined_jds"), limit=200)

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
        ))

    return applications

########## /generate ##########

class GenerateRequest(BaseModel):
    jd_id: str

class GenerateResponse(BaseModel):
    tailored_resume: str
    resume_docx_url: str
    cover_letter: str
    cover_letter_docx_url: str

@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, email: str = Depends(get_verified_email)):
    user_id = generate_user_id(email)
    result = generate_tailored_resume(user_id=user_id, jd_id=req.jd_id)
    return GenerateResponse(**result)