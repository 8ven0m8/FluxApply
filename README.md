# FluxApply

**AI-powered resume and cover letter tailoring for every job application.**

FluxApply takes your resume and a job description, and generates a tailored resume and cover letter matched to that specific role — preserving your original formatting and only rewriting what actually needs to change.

- **Website:** [fluxapply.me](https://www.fluxapply.me/)  
- **Demo video:** [Watch here](https://fluxapply-public-assets.s3.ap-south-2.amazonaws.com/demo.mp4)

---

## What it does

1. **Upload your resume** —> FluxApply extracts your experience, skills, and formatting style.
2. **Submit a job description** (paste text or a URL) —> it's scraped and refined into structured requirements.
3. **Generate** —> an LLM pipeline diffs your resume against the JD's requirements and rewrites only the matched items, producing a tailored resume and a cover letter.
4. **Edit and download** —> review the generated content in-app, make edits, and export polished `.docx` files styled to match your original resume.
5. **Track applications** —> a persistent sidebar keeps every JD you've tailored for, with status tracking (applied, interviewing, offer, rejected).

## Key design principles

- **ID-based fact matching** —> the LLM only rewrites resume items it can match against the job's requirements; it never invents or re-originates experience you didn't have.
- **No silent overwrites** —> edits you make by hand are never auto-rewritten by the LLM (e.g. cover letter length isn't auto-shortened; you're warned and given control instead).
- **Style preservation** —> tailored documents are rendered back into your original resume's formatting, not a generic template.

## Tech stack

**Backend**
- FastAPI
- LangGraph + `PostgresStore` for long-term memory, `AsyncPostgresSaver` for workflow checkpointing
- Playwright for job description scraping
- `python-docx` / `pypdf` for resume extraction and document generation
- Pydantic (`PydanticOutputParser`) for structured LLM outputs throughout
- AWS S3 for file storage (with lifecycle rules for ephemeral generated files)
- Razorpay for subscription billing
- Google OAuth for authentication

**Frontend**
- Next.js
- NextAuth.js (Google OAuth)

## Architecture

The core tailoring pipeline is a LangGraph workflow:

![Graph Architecture](https://fluxapply-public-assets.s3.ap-south-2.amazonaws.com/graph.png)

Each user's data (resume facts, refined job descriptions, tailored resumes, cover letters, application status) is namespaced in Postgres by `user_id` and `jd_id`, keeping every user's data fully isolated.

## API overview

| Endpoint | Description |
|---|---|
| `POST /users` | Get or create a deterministic `user_id` from an authenticated email |
| `POST /resume/upload` | Upload a resume, extract structured facts |
| `POST /jd/submit` | Submit a job description (URL or pasted text) |
| `POST /jd/{jd_id}/paste` | Resume a JD flow that needed manually pasted text |
| `POST /generate` | Run the full tailoring pipeline for a given JD |
| `PUT /resume/{jd_id}/render` | Re-render an edited tailored resume to `.docx` |
| `PUT /cover-letter/{jd_id}/render` | Re-render an edited cover letter to `.docx` |
| `GET /applications` | List all applications tracked for the user |
| `PUT /applications/{jd_id}/status` | Update an application's status |
| `POST /subscription/create` | Start a Razorpay subscription |
| `POST /webhook/razorpay` | Razorpay billing event webhook |

Authentication is via Google ID tokens (`Authorization: Bearer <token>`), verified server-side on every request — the client never supplies its own `user_id`.

## Status

FluxApply is live at [fluxapply.me](https://www.fluxapply.me/) and under active development.
