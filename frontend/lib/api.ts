const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      // ignore, keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export interface RefinedJD {
  role_title: string;
  company: string;
  location?: string | null;
  employment_type?: string | null;
  compensation?: string | null;
  company_summary?: string | null;
  requirements: { text: string; category: string; skill_area: string }[];
  tech_stack: string[];
  application_method: string;
  external_application_url?: string | null;
}

export interface JDSubmitResponse {
  status: "done" | "needs_paste";
  jd_id: string;
  message?: string | null;
  refined_jd?: string | null; // JSON string
}

export interface GenerateResponse {
  tailored_resume: string;
  resume_docx_url: string;
  cover_letter: string;
  cover_letter_docx_url: string;
}

export interface ApplicationSummary {
  jd_id: string;
  role_title: string;
  company: string;
  location?: string | null;
  resume_docx_url?: string | null;
  cover_letter_docx_url?: string | null;
}

/**
 * Verifies the caller's Google ID token against the backend and returns
 * the deterministic user_id derived from the verified email. Replaces the
 * old createUser(email) — the backend no longer accepts a client-supplied
 * email or user_id anywhere; every endpoint derives it from `token`.
 */
export async function whoAmI(token: string): Promise<{ user_id: string }> {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function uploadResume(
  token: string,
  file: File
): Promise<{ user_id: string; resume_facts: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/resume/upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  return handle(res);
}

export async function submitJD(
  token: string,
  opts: { url?: string; pastedText?: string }
): Promise<JDSubmitResponse> {
  const res = await fetch(`${API_BASE}/jd/submit`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      url: opts.url || undefined,
      pasted_text: opts.pastedText || undefined,
    }),
  });
  return handle(res);
}

export async function pasteJD(
  token: string,
  jdId: string,
  pastedText: string
): Promise<JDSubmitResponse> {
  const res = await fetch(`${API_BASE}/jd/${jdId}/paste`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ pasted_text: pastedText }),
  });
  return handle(res);
}

export async function generate(
  token: string,
  jdId: string
): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ jd_id: jdId }),
  });
  return handle(res);
}

export async function getResumeStatus(
  token: string
): Promise<{ has_resume: boolean }> {
  const res = await fetch(`${API_BASE}/resume/status`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handle(res);
}
 
export async function listApplications(
  token: string
): Promise<ApplicationSummary[]> {
  const res = await fetch(`${API_BASE}/applications`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handle(res);
}
