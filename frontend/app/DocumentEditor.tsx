"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  renderResume,
  renderCoverLetter,
  TailoredResumeContent,
  CoverLetter,
} from "@/lib/api";

type Tab = "resume" | "cover_letter";

interface DocumentEditorProps {
  token: string;
  jdId: string;
  initialResumeJson: string; // JSON string of TailoredResumeContent, "" if not loaded
  initialCoverLetterJson: string; // JSON string of CoverLetter, "" if not loaded
  resumeDocxUrl: string | null;
  coverLetterDocxUrl: string | null;
  onUrlsUpdated: (urls: { resume_docx_url?: string; cover_letter_docx_url?: string }) => void;
}

const inputClass =
  "focus-ring w-full rounded border border-line bg-surface px-3 py-2 text-sm";
const labelClass = "mb-1 block text-xs font-medium text-ink/60";
const cardClass = "space-y-3 rounded border border-line bg-surface/50 p-4";

function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return "Something went wrong saving your edits.";
}

export default function DocumentEditor({
  token,
  jdId,
  initialResumeJson,
  initialCoverLetterJson,
  resumeDocxUrl,
  coverLetterDocxUrl,
  onUrlsUpdated,
}: DocumentEditorProps) {
  const [tab, setTab] = useState<Tab>("resume");

  const [resume, setResume] = useState<TailoredResumeContent | null>(
    initialResumeJson ? JSON.parse(initialResumeJson) : null
  );
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(
    initialCoverLetterJson ? JSON.parse(initialCoverLetterJson) : null
  );

  // jdId changing means a different application was opened — reset local
  // edit state from the freshly-loaded content rather than keeping stale
  // edits from whatever was open before.
  useEffect(() => {
    setResume(initialResumeJson ? JSON.parse(initialResumeJson) : null);
    setCoverLetter(initialCoverLetterJson ? JSON.parse(initialCoverLetterJson) : null);
    setTab("resume");
    setResumeError(null);
    setCoverLetterError(null);
    setResumeSavedAt(null);
    setCoverLetterSavedAt(null);
  }, [jdId, initialResumeJson, initialCoverLetterJson]);

  const [savingResume, setSavingResume] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeSavedAt, setResumeSavedAt] = useState<number | null>(null);

  const [savingCoverLetter, setSavingCoverLetter] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
  const [coverLetterSavedAt, setCoverLetterSavedAt] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  async function handleSaveResume() {
    if (!resume) return;
    setSavingResume(true);
    setResumeError(null);
    try {
      const res = await renderResume(token, jdId, resume);
      onUrlsUpdated({ resume_docx_url: res.resume_docx_url });
      setResumeSavedAt(Date.now());
    } catch (e) {
      setResumeError(describeError(e));
    } finally {
      setSavingResume(false);
    }
  }

  async function handleSaveCoverLetter() {
    if (!coverLetter) return;
    setSavingCoverLetter(true);
    setCoverLetterError(null);
    try {
      const res = await renderCoverLetter(token, jdId, coverLetter);
      onUrlsUpdated({ cover_letter_docx_url: res.cover_letter_docx_url });
      setPageCount(res.page_count);
      setCoverLetterSavedAt(Date.now());
    } catch (e) {
      setCoverLetterError(describeError(e));
    } finally {
      setSavingCoverLetter(false);
    }
  }

  if (!resume && !coverLetter) {
    return (
      <p className="text-sm text-ink/50">
        Couldn&apos;t load editable content for this application — you can still download
        the files above, or generate again.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-line text-sm">
        <button
          onClick={() => setTab("resume")}
          disabled={!resume}
          className={`-mb-px border-b-2 px-3 py-2 font-medium disabled:opacity-40 ${
            tab === "resume" ? "border-accent text-accentDark" : "border-transparent text-ink/50 hover:text-ink"
          }`}
        >
          Resume
        </button>
        <button
          onClick={() => setTab("cover_letter")}
          disabled={!coverLetter}
          className={`-mb-px border-b-2 px-3 py-2 font-medium disabled:opacity-40 ${
            tab === "cover_letter" ? "border-accent text-accentDark" : "border-transparent text-ink/50 hover:text-ink"
          }`}
        >
          Cover letter
        </button>
      </div>

      {tab === "resume" && resume && (
        <ResumeEditor
          resume={resume}
          onChange={setResume}
          onSave={handleSaveResume}
          saving={savingResume}
          error={resumeError}
          savedAt={resumeSavedAt}
          docxUrl={resumeDocxUrl}
        />
      )}

      {tab === "cover_letter" && coverLetter && (
        <CoverLetterEditor
          coverLetter={coverLetter}
          onChange={setCoverLetter}
          onSave={handleSaveCoverLetter}
          saving={savingCoverLetter}
          error={coverLetterError}
          savedAt={coverLetterSavedAt}
          pageCount={pageCount}
          docxUrl={coverLetterDocxUrl}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Small list-editing helpers — every array-of-strings field (skills,
// achievements, technologies, education, etc.) shares this pattern: one
// row per item, a text input, a remove button, and an "add" button below.
// ---------------------------------------------------------------------

function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={v}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className={inputClass}
            />
            <button
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${label} item`}
              className="rounded border border-line px-2 text-ink/50 hover:border-rust hover:text-rust"
              type="button"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ""])}
          className="text-xs text-accentDark hover:underline"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function SaveBar({
  onSave,
  saving,
  error,
  savedAt,
  docxUrl,
  extraNote,
}: {
  onSave: () => void;
  saving: boolean;
  error: string | null;
  savedAt: number | null;
  docxUrl: string | null;
  extraNote?: string | null;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accentDark disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
      {docxUrl && (
        <a
          href={docxUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-accentDark hover:underline"
        >
          Download .docx →
        </a>
      )}
      {savedAt && !saving && <span className="text-xs text-ink/40">Saved — file updated.</span>}
      {error && <span className="text-xs text-rust">{error}</span>}
      {extraNote && <span className="text-xs text-ink/50">{extraNote}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Resume editor
// ---------------------------------------------------------------------

function ResumeEditor({
  resume,
  onChange,
  onSave,
  saving,
  error,
  savedAt,
  docxUrl,
}: {
  resume: TailoredResumeContent;
  onChange: (next: TailoredResumeContent) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  savedAt: number | null;
  docxUrl: string | null;
}) {
  function patch(partial: Partial<TailoredResumeContent>) {
    onChange({ ...resume, ...partial });
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <label className={labelClass}>Summary</label>
        <textarea
          value={resume.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </div>

      <StringListEditor
        label="Skills"
        values={resume.skills}
        onChange={(skills) => patch({ skills })}
      />

      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Projects</p>
          <button
            type="button"
            onClick={() =>
              patch({
                projects: [...resume.projects, { title: "", description: "", technologies: [] }],
              })
            }
            className="text-xs text-accentDark hover:underline"
          >
            + Add project
          </button>
        </div>
        {resume.projects.map((p, i) => (
          <div key={i} className="space-y-2 rounded border border-line p-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Title</label>
              <button
                type="button"
                onClick={() => patch({ projects: resume.projects.filter((_, idx) => idx !== i) })}
                className="text-xs text-ink/40 hover:text-rust"
              >
                Remove
              </button>
            </div>
            <input
              value={p.title}
              onChange={(e) => {
                const next = [...resume.projects];
                next[i] = { ...next[i], title: e.target.value };
                patch({ projects: next });
              }}
              className={inputClass}
            />
            <label className={labelClass}>Description</label>
            <textarea
              value={p.description ?? ""}
              onChange={(e) => {
                const next = [...resume.projects];
                next[i] = { ...next[i], description: e.target.value };
                patch({ projects: next });
              }}
              rows={2}
              className={inputClass}
            />
            <label className={labelClass}>Technologies (comma-separated)</label>
            <input
              value={p.technologies.join(", ")}
              onChange={(e) => {
                const next = [...resume.projects];
                next[i] = {
                  ...next[i],
                  technologies: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                };
                patch({ projects: next });
              }}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Experience</p>
          <button
            type="button"
            onClick={() =>
              patch({
                experience: [...resume.experience, { company: "", role: "", dates: "", description: "" }],
              })
            }
            className="text-xs text-accentDark hover:underline"
          >
            + Add experience
          </button>
        </div>
        {resume.experience.map((exp, i) => (
          <div key={i} className="space-y-2 rounded border border-line p-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Company / Role / Dates</label>
              <button
                type="button"
                onClick={() => patch({ experience: resume.experience.filter((_, idx) => idx !== i) })}
                className="text-xs text-ink/40 hover:text-rust"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={exp.company ?? ""}
                placeholder="Company"
                onChange={(e) => {
                  const next = [...resume.experience];
                  next[i] = { ...next[i], company: e.target.value };
                  patch({ experience: next });
                }}
                className={inputClass}
              />
              <input
                value={exp.role ?? ""}
                placeholder="Role"
                onChange={(e) => {
                  const next = [...resume.experience];
                  next[i] = { ...next[i], role: e.target.value };
                  patch({ experience: next });
                }}
                className={inputClass}
              />
              <input
                value={exp.dates ?? ""}
                placeholder="Dates"
                onChange={(e) => {
                  const next = [...resume.experience];
                  next[i] = { ...next[i], dates: e.target.value };
                  patch({ experience: next });
                }}
                className={inputClass}
              />
            </div>
            <label className={labelClass}>Description</label>
            <textarea
              value={exp.description ?? ""}
              onChange={(e) => {
                const next = [...resume.experience];
                next[i] = { ...next[i], description: e.target.value };
                patch({ experience: next });
              }}
              rows={2}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div>
        <label className={labelClass}>Achievements</label>
        <div className="space-y-2">
          {resume.achievements.map((ach, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={ach.text}
                placeholder="Achievement text"
                onChange={(e) => {
                  const next = [...resume.achievements];
                  next[i] = { ...next[i], text: e.target.value };
                  patch({ achievements: next });
                }}
                className={inputClass}
              />
              <button
                onClick={() =>
                  patch({ achievements: resume.achievements.filter((_, idx) => idx !== i) })
                }
                aria-label="Remove achievement"
                className="rounded border border-line px-2 text-ink/50 hover:border-rust hover:text-rust"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              patch({ achievements: [...resume.achievements, { text: "", links: [] }] })
            }
            className="text-xs text-accentDark hover:underline"
          >
            + Add achievement
          </button>
        </div>
      </div>

      <SaveBar onSave={onSave} saving={saving} error={error} savedAt={savedAt} docxUrl={docxUrl} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Cover letter editor
// ---------------------------------------------------------------------

function CoverLetterEditor({
  coverLetter,
  onChange,
  onSave,
  saving,
  error,
  savedAt,
  pageCount,
  docxUrl,
}: {
  coverLetter: CoverLetter;
  onChange: (next: CoverLetter) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  savedAt: number | null;
  pageCount: number | null;
  docxUrl: string | null;
}) {
  function patch(partial: Partial<CoverLetter>) {
    onChange({ ...coverLetter, ...partial });
  }

  return (
    <div className="space-y-4 pb-4">
      <div className={cardClass}>
        <p className="text-sm font-medium">Your details</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={coverLetter.header.full_name ?? ""}
            placeholder="Full name"
            onChange={(e) => patch({ header: { ...coverLetter.header, full_name: e.target.value } })}
            className={inputClass}
          />
          <input
            value={coverLetter.header.email ?? ""}
            placeholder="Email"
            onChange={(e) => patch({ header: { ...coverLetter.header, email: e.target.value } })}
            className={inputClass}
          />
          <input
            value={coverLetter.header.phone ?? ""}
            placeholder="Phone"
            onChange={(e) => patch({ header: { ...coverLetter.header, phone: e.target.value } })}
            className={inputClass}
          />
          <input
            value={coverLetter.header.address ?? ""}
            placeholder="Address"
            onChange={(e) => patch({ header: { ...coverLetter.header, address: e.target.value } })}
            className={inputClass}
          />
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium">Employer</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={coverLetter.employers_info.hiring_manager_name ?? ""}
            placeholder="Hiring manager name"
            onChange={(e) =>
              patch({ employers_info: { ...coverLetter.employers_info, hiring_manager_name: e.target.value } })
            }
            className={inputClass}
          />
          <input
            value={coverLetter.employers_info.hiring_manager_title ?? ""}
            placeholder="Hiring manager title"
            onChange={(e) =>
              patch({ employers_info: { ...coverLetter.employers_info, hiring_manager_title: e.target.value } })
            }
            className={inputClass}
          />
          <input
            value={coverLetter.employers_info.company_name ?? ""}
            placeholder="Company name"
            onChange={(e) =>
              patch({ employers_info: { ...coverLetter.employers_info, company_name: e.target.value } })
            }
            className={inputClass}
          />
          <input
            value={coverLetter.employers_info.company_address ?? ""}
            placeholder="Company address"
            onChange={(e) =>
              patch({ employers_info: { ...coverLetter.employers_info, company_address: e.target.value } })
            }
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Salutation</label>
        <input value={coverLetter.ation} onChange={(e) => patch({ ation: e.target.value })} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Opening paragraph</label>
        <textarea
          value={coverLetter.openingsalut_paragraph}
          onChange={(e) => patch({ openingsalut_paragraph: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Body paragraphs</p>
          <button
            type="button"
            onClick={() =>
              patch({ body_paragraphs: [...coverLetter.body_paragraphs, { content: "" }] })
            }
            className="text-xs text-accentDark hover:underline"
          >
            + Add paragraph
          </button>
        </div>
        {coverLetter.body_paragraphs.map((p, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Paragraph {i + 1}</label>
              <button
                type="button"
                onClick={() =>
                  patch({ body_paragraphs: coverLetter.body_paragraphs.filter((_, idx) => idx !== i) })
                }
                className="text-xs text-ink/40 hover:text-rust"
              >
                Remove
              </button>
            </div>
            <textarea
              value={p.content}
              onChange={(e) => {
                const next = [...coverLetter.body_paragraphs];
                next[i] = { content: e.target.value };
                patch({ body_paragraphs: next });
              }}
              rows={3}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div>
        <label className={labelClass}>Closing paragraph</label>
        <textarea
          value={coverLetter.closing_paragraph}
          onChange={(e) => patch({ closing_paragraph: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Sign-off</label>
          <input
            value={coverLetter.sign_off}
            onChange={(e) => patch({ sign_off: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Signature name</label>
          <input
            value={coverLetter.signature_name ?? ""}
            onChange={(e) => patch({ signature_name: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <SaveBar
        onSave={onSave}
        saving={saving}
        error={error}
        savedAt={savedAt}
        docxUrl={docxUrl}
        extraNote={
          pageCount && pageCount > 1
            ? `Heads up — this now runs ${pageCount} pages. Cover letters usually read better at one.`
            : undefined
        }
      />
    </div>
  );
}
