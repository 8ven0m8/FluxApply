"use client";

import { useEffect, useRef, useState } from "react";
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

// The NextAuth session survives a refresh (it's a cookie), but the wizard's
// own progress — step/jdId/refinedJD/result/the JD text — used to live only
// in useState, so reloading the tab always bounced back to step 1 even
// though the user was still signed in. That read as "it logs me out."
//
// This is read via useState's lazy initializer (below), NOT a useEffect.
// An effect-based restore was tried first and had a race: the "restore"
// effect and the "persist on change" effect both fire on the same initial
// commit, and the persist effect — still closured over the pre-restore
// default values — would immediately overwrite the just-restored value
// back to the default. Reading synchronously during first render sidesteps
// that entirely; there's no window where a stale value can stomp it.
const WIZARD_STORAGE_KEY = "fluxapply-wizard-state";

type WizardStorageShape = Partial<{
  step: Step;
  jdId: string | null;
  refinedJD: JDDisplayInfo | null;
  result: GenerateResponse | null;
  jdUrl: string;
  jdPasteText: string;
  needsPaste: boolean;
  pasteMessage: string | null;
}>;

function readWizardStorage(): WizardStorageShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WizardStorageShape) : {};
  } catch {
    return {};
  }
}

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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Dark mode — actual class is applied synchronously by the blocking
  // script in layout.tsx (avoids a flash of the wrong theme); this state
  // just mirrors it so the toggle button's icon renders correctly.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage can throw in private-browsing/blocked-storage modes —
      // theme just won't persist across reloads, which is fine.
    }
  }

  function describeError(e: unknown): string {
    if (e instanceof ApiError) return e.detail;
    if (e instanceof Error) return e.message;
    return "Something went wrong. Check that the backend is running.";
  }

  // If the background id_token refresh (see lib/auth.ts) ever fails —
  // no refresh_token on an old session, or Google revoked access — every
  // backend call would otherwise start silently 401ing (which is exactly
  // what made application history "disappear" before this was added).
  // Send the user straight back through Google sign-in instead.
  useEffect(() => {
    if (session?.error === "RefreshFailed" || session?.error === "NoRefreshToken") {
      signIn("google");
    }
  }, [session?.error]);

  // The NextAuth session survives a refresh (it's a cookie), but the
  // wizard's own progress didn't used to. Restoring it can't happen during
  // the initial render anymore (that render has to match the server's
  // markup exactly, and the server never sees sessionStorage — reading it
  // in a useState lazy initializer caused text/attribute hydration
  // mismatches, e.g. a step badge rendering "1" on the server and "✓" on
  // the client). So both state and html.className now start identical on
  // server and client, and this effect restores the real values once,
  // after mount.
  //
  // skipNextPersist guards the persist effect below from the original
  // race: the persist effect also runs on mount, in the same commit as
  // this one, before these setState calls have actually taken effect —
  // so its first run would just re-persist the pre-restore defaults,
  // stomping on the very values being restored. Skipping that first run
  // means persisting only starts once the restored state has landed and
  // an actual change fires the effect again.
  const skipNextPersist = useRef(true);
  useEffect(() => {
    const saved = readWizardStorage();
    if (saved.step !== undefined) setStep(saved.step);
    if (saved.jdId !== undefined) setJdId(saved.jdId);
    if (saved.refinedJD !== undefined) setRefinedJD(saved.refinedJD);
    if (saved.result !== undefined) setResult(saved.result);
    if (saved.jdUrl !== undefined) setJdUrl(saved.jdUrl);
    if (saved.jdPasteText !== undefined) setJdPasteText(saved.jdPasteText);
    if (saved.needsPaste !== undefined) setNeedsPaste(saved.needsPaste);
    if (saved.pasteMessage !== undefined) setPasteMessage(saved.pasteMessage);
  }, []);

  // This effect's only job is to keep sessionStorage in sync as the
  // wizard progresses. sessionStorage (not localStorage) is deliberate:
  // it clears itself when the tab actually closes, so a shared/public
  // machine doesn't leak a stale JD or resume into the next person's tab,
  // while still surviving an in-tab refresh.
  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEY,
        JSON.stringify({ step, jdId, refinedJD, result, jdUrl, jdPasteText, needsPaste, pasteMessage })
      );
    } catch {
      // Storage full/blocked — progress just won't survive a refresh.
    }
  }, [step, jdId, refinedJD, result, jdUrl, jdPasteText, needsPaste, pasteMessage]);

  // Sign-out should always land back at a clean step 1, and shouldn't leave
  // the previous user's in-progress JD sitting in storage for whoever (or
  // whatever session) comes next.
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      try {
        sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      } catch {
        // ignore
      }
      setStep(1);
    }
  }, [sessionStatus]);

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

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
  }

  return (
    <div className="flex min-h-screen w-full">
      <button
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="fixed right-4 top-4 z-40 flex items-center justify-center rounded border border-line bg-surface p-2 text-ink/70 hover:border-accent hover:text-ink"
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>
      {showSidebar && (
        <aside
          className={`${
            mobileSidebarOpen ? "fixed inset-0 z-50 flex" : "hidden"
          } w-full flex-col bg-paper px-6 py-8 md:static md:z-auto md:flex md:w-64 md:shrink-0 md:border-r md:border-line md:px-4 md:py-14`}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-ink/40">
              Applications
            </p>
            <button
              onClick={closeMobileSidebar}
              aria-label="Close menu"
              className="-mr-1 rounded p-1 text-ink/50 hover:text-ink md:hidden"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => {
              handleNewApplication();
              closeMobileSidebar();
            }}
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
                  onClick={() => {
                    handleSelectApplication(app);
                    closeMobileSidebar();
                  }}
                  className={`w-full rounded px-3 py-2 text-left text-sm hover:bg-surface ${
                    jdId === app.jd_id ? "border border-accent/30 bg-surface" : ""
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
            onClick={() => {
              handleUpdateResumeClick();
              closeMobileSidebar();
            }}
            className="mt-4 rounded border border-line px-3 py-2 text-left text-sm text-ink/70 hover:bg-surface"
          >
            Update resume
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-2 rounded border border-line px-3 py-2 text-left text-sm text-ink/70 hover:bg-surface"
          >
            Log out
          </button>
        </aside>
      )}

      <div className="flex w-full flex-1 justify-center">
        <main className="flex w-full max-w-2xl flex-col px-6 py-14">
          <header className="mb-10">
            {showSidebar && (
              <button
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open menu"
                className="mb-4 flex items-center justify-center rounded border border-line p-2 text-ink/70 hover:bg-surface md:hidden"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
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
                  className="flex items-center gap-2 rounded border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-accent"
                >
                  Continue with Google
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded border border-line bg-surface px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{session?.user?.email}</p>
                    <p className="text-xs text-ink/50">
                      {loadingUser ? "Setting up your account…" : "Signed in with Google"}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
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
                className="focus-ring block w-full rounded border border-line bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-accentDark"
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
                className="rounded border border-line px-4 py-2 text-sm text-ink/70 hover:bg-surface"
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
                    className="focus-ring w-full rounded border border-line bg-surface px-3 py-2 text-sm"
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
                    className="focus-ring w-full rounded border border-line bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(hasResume ? 1 : 2)}
                    className="rounded border border-line px-4 py-2 text-sm text-ink/70 hover:bg-surface"
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
                    className="focus-ring w-full rounded border border-line bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setNeedsPaste(false);
                      setJdPasteText("");
                    }}
                    className="rounded border border-line px-4 py-2 text-sm text-ink/70 hover:bg-surface"
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
              <div className="rounded border border-line bg-surface px-4 py-3">
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
                  className="flex items-center justify-between rounded border border-line bg-surface px-4 py-3 text-sm hover:border-accent"
                >
                  <span>Tailored resume (.docx)</span>
                  <span className="text-accentDark">Download →</span>
                </a>
                <a
                  href={result.cover_letter_docx_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded border border-line bg-surface px-4 py-3 text-sm hover:border-accent"
                >
                  <span>Cover letter (.docx)</span>
                  <span className="text-accentDark">Download →</span>
                </a>
              </div>
            )}
          </section>
        )}
        </main>
      </div>
    </div>
  );
}
