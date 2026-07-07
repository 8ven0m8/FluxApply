# FluxApply
Make applying jobs painless and easy

## Backend TODOs

**Priority — likely to break in real use**
- [ ] Add try/except + retry logic around `llm.invoke()` → `parser.parse()` in `tailor_resume_node`, `generate_coverletter_node`, and `shorten_coverletter_node` — currently any malformed LLM response or schema validation failure crashes the whole graph run.
- [ ] Replace local `/tmp` (or `./tmp`) file paths with durable storage (S3/GCS/etc.) — local files won't survive in serverless/ephemeral environments, and the current return value (a local path) isn't usable by a real client unless something else uploads it first.
- [ ] Add input validation at the start of the graph (e.g. in `tailor_resume_node` or a dedicated first node) to confirm `resume_facts` and `refined_jd` actually exist for the given `user_id`/`jd_id` before running expensive LLM calls — right now a bad ID fails deep with an unclear `None.value` error.

**Worth doing — consistency/robustness**
- [ ] Add a page-count check + shorten loop for the **resume** (mirroring the cover letter's `generate_cover_letter` → `shorten_cover_letter` pattern) — confirm whether `build_resume_docx`/the style template already constrains length, since resumes are typically more page-sensitive than cover letters.
- [ ] Add cleanup/lifecycle management for generated `.docx` files after they're served to the user (or after failed runs), so orphaned files don't accumulate.
- [ ] Standardize path construction across all nodes to use `pathlib.Path` consistently (currently mixed with f-strings in places) to avoid subtle formatting inconsistencies.

**Optional — depends on product scope**
- [ ] Add a grounding/hallucination check node that verifies no fabricated companies, skills, or metrics appear in the tailored resume or cover letter output (prompts currently instruct against this, but don't guarantee it).
- [ ] Add a final packaging node — e.g. bundling resume + cover letter into a single response object with signed download URLs, or zipping them together.
- [ ] Decide on and implement a policy for what happens if `shorten_cover_letter` exhausts its 2 attempts and the letter still overflows — currently it just ends silently with the best available version; may want to log/flag this case for visibility.