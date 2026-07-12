"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  ApiError,
  whoAmI,
  uploadResume,
  submitJD,
  pasteJD,
  generate,
  getResumeStatus,
  listApplications,
  RefinedJD,
  GenerateResponse,
  ApplicationSummary,
} from "@/lib/api";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Identify",
  2: "Resume",
  3: "Job",
  4: "Generate",
};

// Step 4's info card only ever needs these three fields, whether the JD
// just came back from /jd/submit (a full RefinedJD) or was picked from the
// sidebar (a lighter ApplicationSummary) — so it's typed against the
// smallest shape both sources actually satisfy.
type JDDisplayInfo = Pick<RefinedJD, "role_title" | "company" | "location">;

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — identify
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  // Resume state — fetched once per session so returning users aren't
  // asked to re-upload every time. `null` = not checked yet.
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [updatingResume, setUpdatingResume] = useState(false);
  const [previousStep, setPreviousStep] = useState<Step>(3);

  // Step 2 — resume
  const [file, setFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  // Step 3 — job description
  const [jdUrl, setJdUrl] = useState("");
  const [jdPasteText, setJdPasteText] = useState("");
  const [needsPaste, setNeedsPaste] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [jdId, setJdId] = useState<string | null>(null);
  const [refinedJD, setRefinedJD] = useState<JDDisplayInfo | null>(null);
  const [submittingJD, setSubmittingJD] = useState(false);

  // Step 4 — generate
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  // Sidebar — past applications
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);

  function describeError(e: unknown): string {
    if (e instanceof ApiError) return e.detail;
    if (e instanceof Error) return e.message;
    return "Something went wrong. Check that the backend is running.";
  }

  async function refreshApplications(token: string) {
    setLoadingApplications(true);
    try {
      const apps = await listApplications(token);
      setApplications(apps);
    } catch (e) {
      // Sidebar staying stale isn't worth interrupting the main flow with
      // an error banner — just log it.
      console.error("Failed to load applications:", e);
    } finally {
      setLoadingApplications(false);
    }
  }

  // Once Google confirms who's signed in and NextAuth has captured the ID
  // token, ask the backend to verify it and hand back the user_id it
  // derives. Nothing here is trusted client-side — the token is what
  // proves identity on every subsequent call.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.idToken || userId) {
      return;
    }
    setError(null);
    setLoadingUser(true);
    whoAmI(session.idToken)
      .then((res) => setUserId(res.user_id))
      .catch((e) => setError(describeError(e)))
      .finally(() => setLoadingUser(false));
  }, [sessionStatus, session?.idToken, userId]);

  // Once identified, check whether a resume is already on file and load
  // the sidebar's application history — both one-time, right after login.
  useEffect(() => {
    if (!session?.idToken || !userId) return;
    getResumeStatus(session.idToken)
      .then((res) => setHasResume(res.has_resume))
      .catch((e) => {
        console.error("Failed to check resume status:", e);
        setHasResume(false); // fail open to the upload step rather than getting stuck
      });
    refreshApplications(session.idToken);
  }, [session?.idToken, userId]);

  async function handleUploadResume() {
    setError(null);
    if (!file || !session?.idToken) {
      setError("Choose a .pdf or .docx resume to continue.");
      return;
    }
    setUploadingResume(true);
    try {
      await uploadResume(session.idToken, file);
      setHasResume(true);
      if (updatingResume) {
        setUpdatingResume(false);
        setStep(previousStep);
      } else {
        setStep(3);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setUploadingResume(false);
    }
  }

  async function handleSubmitJD() {
    setError(null);
    if (!session?.idToken) return;
    if (!jdUrl.trim() && !jdPasteText.trim()) {
      setError("Paste a job posting URL, or paste the job description text.");
      return;
    }
    setSubmittingJD(true);
    try {
      const res = await submitJD(session.idToken, {
        url: jdUrl.trim() || undefined,
        pastedText: !jdUrl.trim() ? jdPasteText.trim() || undefined : undefined,
      });
      setJdId(res.jd_id);
      if (res.status === "needs_paste") {
        setNeedsPaste(true);
        setPasteMessage(res.message || "Please paste the job description text.");
      } else if (res.refined_jd) {
        setRefinedJD(JSON.parse(res.refined_jd));
        setNeedsPaste(false);
        setStep(4);
        refreshApplications(session.idToken); // new entry is already persisted server-side
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSubmittingJD(false);
    }
  }

  async function handleResumePaste() {
    setError(null);
    if (!session?.idToken || !jdId) return;
    if (!jdPasteText.trim()) {
      setError("Paste the job description text to continue.");
      return;
    }
    setSubmittingJD(true);
    try {
      const res = await pasteJD(session.idToken, jdId, jdPasteText.trim());
      if (res.refined_jd) {
        setRefinedJD(JSON.parse(res.refined_jd));
      }
      setNeedsPaste(false);
      setStep(4);
      refreshApplications(session.idToken);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSubmittingJD(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    if (!session?.idToken || !jdId) return;
    setGenerating(true);
    try {
      const res = await generate(session.idToken, jdId);
      setResult(res);
      refreshApplications(session.idToken); // picks up the new download links
    } catch (e) {
      setError(describeError(e));
    } finally {
      setGenerating(false);
    }
  }

  function handleNewApplication() {
    setJdId(null);
    setRefinedJD(null);
    setResult(null);
    setJdUrl("");
    setJdPasteText("");
    setNeedsPaste(false);
    setPasteMessage(null);
    setError(null);
    setStep(3);
  }

  function handleSelectApplication(app: ApplicationSummary) {
    setError(null);
    setJdId(app.jd_id);
    setRefinedJD({ role_title: app.role_title, company: app.company, location: app.location ?? null });
    if (app.resume_docx_url && app.cover_letter_docx_url) {
      setResult({
        tailored_resume: "",
        resume_docx_url: app.resume_docx_url,
        cover_letter: "",
        cover_letter_docx_url: app.cover_letter_docx_url,
      });
    } else {
      // Files expired (lifecycle rule) or were never generated — the
      // Generate button on step 4 will happily regenerate them.
      setResult(null);
    }
    setStep(4);
  }

  function handleUpdateResumeClick() {
    setPreviousStep(step);
    setUpdatingResume(true);
    setError(null);
    setStep(2);
  }

  const showSidebar = sessionStatus === "authenticated" && !!userId && step > 1;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl">
      {showSidebar && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line px-4 py-14 md:flex">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ink/40">
            Applications
          </p>
          <button
            onClick={handleNewApplication}
            className="mb-4 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-left text-sm font-medium text-accentDark hover:bg-accent/10"
          >
            + New application
          </button>

          <div className="flex-1 space-y-1 overflow-y-auto">
            {loadingApplications && applications.length === 0 ? (
              <p className="px-1 text-xs text-ink/40">Loading…</p>
            ) : applications.length === 0 ? (
              <p className="px-1 text-xs text-ink/40">No applications yet.</p>
            ) : (
              applications.map((app) => (
                <button
                  key={app.jd_id}
                  onClick={() => handleSelectApplication(app)}
                  className={`w-full rounded px-3 py-2 text-left text-sm hover:bg-white ${
                    jdId === app.jd_id ? "border border-accent/30 bg-white" : ""
                  }`}
                >
                  <p className="truncate font-medium">{app.company}</p>
                  <p className="truncate text-xs text-ink/50">{app.role_title}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink/40">
                    {app.resume_docx_url && app.cover_letter_docx_url ? "Ready" : "Not generated"}
                  </p>
                </button>
              ))
            )}
          </div>

          <button
            onClick={handleUpdateResumeClick}
            className="mt-4 rounded border border-line px-3 py-2 text-left text-sm text-ink/70 hover:bg-white"
          >
            Update resume
          </button>
        </aside>
      )}

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-14">
        <header className="mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accentDark">
            FluxApply
          </p>
          <h1 className="mt-2 font-display text-3xl">
            Tailor a resume to one job.
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            Four steps: identify yourself, upload a resume, point at a job, generate.
          </p>
        </header>

        <ol className="mb-10 flex gap-1 font-mono text-xs uppercase tracking-wide">
          {([1, 2, 3, 4] as Step[]).map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-1">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                  s === step
                    ? "border-accent bg-accent text-paper"
                    : s < step
                    ? "border-accent text-accent"
                    : "border-line text-ink/40"
                }`}
              >
                {s < step ? "✓" : s}
              </span>
              <span className={s <= step ? "text-ink" : "text-ink/40"}>
                {STEP_LABELS[s]}
              </span>
              {i < 3 && <span className="mx-1 h-px flex-1 bg-line" />}
            </li>
          ))}
        </ol>

        {error && (
          <div className="mb-6 rounded border border-rust/30 bg-rust/5 px-4 py-3 text-sm text-rust">
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <section className="space-y-4">
            {sessionStatus === "loading" ? (
              <p className="text-sm text-ink/50">Checking sign-in status…</p>
            ) : sessionStatus !== "authenticated" ? (
              <>
                <p className="text-sm text-ink/60">
                  Sign in with Google to link your resume and generated
                  documents to a verified email — no typing one in by hand.
                </p>
                <button
                  onClick={() => signIn("google")}
                  className="flex items-center gap-2 rounded border border-line bg-white px-4 py-2 text-sm font-medium hover:border-accent"
                >
                  Continue with Google
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded border border-line bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{session?.user?.email}</p>
                    <p className="text-xs text-ink/50">
                      {loadingUser ? "Setting up your account…" : "Signed in with Google"}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut()}
                    className="text-xs text-ink/50 underline underline-offset-4 hover:text-ink"
                  >
                    Sign out
                  </button>
                </div>
                {hasResume && (
                  <p className="text-xs text-ink/50">
                    Resume on file — you can update it anytime from the sidebar.
                  </p>
                )}
                <button
                  onClick={() => setStep(hasResume ? 3 : 2)}
                  disabled={loadingUser || !userId || hasResume === null}
                  className="rounded bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
                >
                  {loadingUser || hasResume === null ? "Setting up…" : "Continue"}
                </button>
              </>
            )}
          </section>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <section className="space-y-4">
            <div>
              <label htmlFor="resume" className="mb-1 block text-sm font-medium">
                {updatingResume ? "Replace your resume (.pdf or .docx)" : "Resume (.pdf or .docx)"}
              </label>
              <input
                id="resume"
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="focus-ring block w-full rounded border border-line bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-accentDark"
              />
              <p className="mt-1 text-xs text-ink/50">
                We extract skills, experience, and projects from this file. It also sets the visual style for the generated resume.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (updatingResume) {
                    setUpdatingResume(false);
                    setStep(previousStep);
                  } else {
                    setStep(1);
                  }
                }}
                className="rounded border border-line px-4 py-2 text-sm text-ink/70 hover:bg-white"
              >
                Back
              </button>
              <button
                onClick={handleUploadResume}
                disabled={uploadingResume}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
              >
                {uploadingResume ? "Uploading…" : "Upload and continue"}
              </button>
            </div>
          </section>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <section className="space-y-5">
            {!needsPaste ? (
              <>
                <div>
                  <label htmlFor="jdUrl" className="mb-1 block text-sm font-medium">
                    Job posting URL
                  </label>
                  <input
                    id="jdUrl"
                    type="url"
                    value={jdUrl}
                    onChange={(e) => setJdUrl(e.target.value)}
                    placeholder="https://company.com/careers/role"
                    className="focus-ring w-full rounded border border-line bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-ink/40">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div>
                  <label htmlFor="jdPaste" className="mb-1 block text-sm font-medium">
                    Paste the job description text
                  </label>
                  <textarea
                    id="jdPaste"
                    value={jdPasteText}
                    onChange={(e) => setJdPasteText(e.target.value)}
                    rows={6}
                    placeholder="Paste the full job posting here (useful for LinkedIn/Indeed, which block scraping)"
                    className="focus-ring w-full rounded border border-line bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(hasResume ? 1 : 2)}
                    className="rounded border border-line px-4 py-2 text-sm text-ink/70 hover:bg-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmitJD}
                    disabled={submittingJD}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
                  >
                    {submittingJD ? "Reading job description…" : "Continue"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accentDark">
                  {pasteMessage}
                </div>
                <div>
                  <label htmlFor="jdPaste2" className="mb-1 block text-sm font-medium">
                    Paste the job description text
                  </label>
                  <textarea
                    id="jdPaste2"
                    value={jdPasteText}
                    onChange={(e) => setJdPasteText(e.target.value)}
                    rows={8}
                    className="focus-ring w-full rounded border border-line bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setNeedsPaste(false);
                      setJdPasteText("");
                    }}
                    className="rounded border border-line px-4 py-2 text-sm text-ink/70 hover:bg-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleResumePaste}
                    disabled={submittingJD}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
                  >
                    {submittingJD ? "Reading job description…" : "Continue"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <section className="space-y-6">
            {refinedJD && (
              <div className="rounded border border-line bg-white px-4 py-3">
                <p className="font-display text-lg">{refinedJD.role_title}</p>
                <p className="text-sm text-ink/60">
                  {refinedJD.company}
                  {refinedJD.location ? ` · ${refinedJD.location}` : ""}
                </p>
              </div>
            )}

            {!result ? (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
              >
                {generating
                  ? "Tailoring resume and writing cover letter…"
                  : "Generate resume and cover letter"}
              </button>
            ) : (
              <div className="space-y-3">
                <a
                  href={result.resume_docx_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded border border-line bg-white px-4 py-3 text-sm hover:border-accent"
                >
                  <span>Tailored resume (.docx)</span>
                  <span className="text-accentDark">Download →</span>
                </a>
                <a
                  href={result.cover_letter_docx_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded border border-line bg-white px-4 py-3 text-sm hover:border-accent"
                >
                  <span>Cover letter (.docx)</span>
                  <span className="text-accentDark">Download →</span>
                </a>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={handleNewApplication}
                className="text-sm text-ink/50 underline underline-offset-4 hover:text-ink"
              >
                Tailor for another job
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
