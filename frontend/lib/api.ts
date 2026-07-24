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
  refined_jd?: string | null;
}

export interface GenerateResponse {
  tailored_resume: string;
  resume_docx_url: string;
  cover_letter: string;
  cover_letter_docx_url: string;
}

// --- Editable document shapes (mirror backend/schemas.py exactly) ---

export interface ResumeDetails {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  profile_urls: string[];
  reference_urls: string[];
  institutions: string[];
  education: string[];
}

export interface ResumeExperience {
  company?: string | null;
  role?: string | null;
  dates?: string | null;
  description?: string | null;
}

export interface ResumeProject {
  title: string;
  description?: string | null;
  technologies: string[];
}

export interface AchievementLink {
  label: string;
  url: string;
}

export interface Achievement {
  text: string;
  links: AchievementLink[];
}

export interface TailoredResumeContent {
  summary: string;
  details: ResumeDetails;
  skills: string[];
  projects: ResumeProject[];
  experience: ResumeExperience[];
  achievements: Achievement[];
}

export interface CoverLetterHeader {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  date: string;
}

export interface CoverLetterEmployer {
  hiring_manager_name?: string | null;
  hiring_manager_title?: string | null;
  company_name?: string | null;
  company_address?: string | null;
}

export interface CoverLetterBodyParagraph {
  content: string;
}

export interface CoverLetter {
  header: CoverLetterHeader;
  employers_info: CoverLetterEmployer;
  ation: string;
  openingsalut_paragraph: string;
  body_paragraphs: CoverLetterBodyParagraph[];
  closing_paragraph: string;
  sign_off: string;
  signature_name?: string | null;
}

export type ApplicationStatus = "not_applied" | "applied" | "interviewing" | "offer" | "rejected";

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "not_applied", label: "Not applied" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

export interface ApplicationSummary {
  jd_id: string;
  role_title: string;
  company: string;
  location?: string | null;
  resume_docx_url?: string | null;
  cover_letter_docx_url?: string | null;
  status: ApplicationStatus;
}

export interface FreeTierStatus {
  upload_used: number;
  jd_used: number;
  generate_used: number;
  generate_available: boolean;
  resets_at: string | null;
}

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

export async function updateApplicationStatus(
  token: string,
  jdId: string,
  status: ApplicationStatus
): Promise<{ jd_id: string; status: ApplicationStatus }> {
  const res = await fetch(`${API_BASE}/applications/${jdId}/status`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return handle(res);
}

export async function getResumeContent(
  token: string,
  jdId: string
): Promise<{ tailored_resume: string }> {
  const res = await fetch(`${API_BASE}/resume/${jdId}/content`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function getCoverLetterContent(
  token: string,
  jdId: string
): Promise<{ cover_letter: string }> {
  const res = await fetch(`${API_BASE}/cover-letter/${jdId}/content`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function renderResume(
  token: string,
  jdId: string,
  content: TailoredResumeContent
): Promise<{ tailored_resume: string; resume_docx_url: string }> {
  const res = await fetch(`${API_BASE}/resume/${jdId}/render`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  return handle(res);
}

export async function renderCoverLetter(
  token: string,
  jdId: string,
  content: CoverLetter
): Promise<{ cover_letter: string; cover_letter_docx_url: string; page_count: number }> {
  const res = await fetch(`${API_BASE}/cover-letter/${jdId}/render`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  return handle(res);
}

export interface SubscriptionStatus {
  active: boolean;
  expires_at: string | null;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  plan_id: string | null;
  cancel_at_period_end: boolean;
}

export async function getSubscriptionStatus(token: string): Promise<SubscriptionStatus> {
  const res = await fetch(`${API_BASE}/subscription/status`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function getFreeTierStatus(token: string): Promise<FreeTierStatus> {
  const res = await fetch(`${API_BASE}/free-tier/status`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function createRazorpaySubscription(
  token: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ subscription_id: string; key_id: string }> {
  const res = await fetch(`${API_BASE}/subscription/create`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl }),
  });
  return handle(res);
}

export async function cancelRazorpaySubscription(
  token: string
): Promise<SubscriptionStatus> {
  const res = await fetch(`${API_BASE}/subscription/cancel`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return handle(res);
}