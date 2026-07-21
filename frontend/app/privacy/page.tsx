export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14 text-ink">
      <h1 className="font-display text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink/50">Last updated: 22/07/2026</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-ink/80">
        <p>
          FluxApply (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) provides a tool that
          generates tailored resumes and cover letters based on a job description
          and a resume you provide. This policy explains what data we collect,
          why, and how it&apos;s handled.
        </p>

        <h2 className="pt-4 font-display text-xl text-ink">Information we collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Google account information:</strong> when you sign in with
            Google, we receive your name, email address, and profile photo via
            Google OAuth, used solely to identify your account.
          </li>
          <li>
            <strong>Resume content:</strong> the resume file you upload (.pdf or
            .docx) is stored so we can extract your skills and experience for
            tailoring future applications.
          </li>
          <li>
            <strong>Job descriptions:</strong> URLs or pasted text of job
            postings you submit, used to generate a tailored resume and cover
            letter for that specific role.
          </li>
          <li>
            <strong>Generated documents:</strong> the tailored resumes and
            cover letters we produce for you, along with basic status metadata
            (e.g. applied, interviewing) you set yourself.
          </li>
        </ul>

        <h2 className="pt-4 font-display text-xl text-ink">How we use your data</h2>
        <p>
          We use your resume and job description content to generate tailored
          application documents through our AI-based processing pipeline.
          Your data is not sold, and is not used to train any third-party AI
          model on data outside your own account.
        </p>

        <h2 className="pt-4 font-display text-xl text-ink">Where your data is stored</h2>
        <p>
          Resume files and generated documents are stored using Amazon Web
          Services (AWS S3). Application and account data is stored in a
          PostgreSQL database. Access to your data is scoped to your account
          and not visible to other users.
        </p>

        <h2 className="pt-4 font-display text-xl text-ink">Third-party services</h2>
        <p>
          We use Google OAuth for authentication, and OpenAI to process resume and job description text for
          generating tailored documents. These providers may process your data
          under their own respective privacy policies.
        </p>

        <h2 className="pt-4 font-display text-xl text-ink">Data retention and deletion</h2>
        <p>
          You may request deletion of your account and associated data at any
          time by contacting us at sapkotapranjal25@gmail.com. We retain data only as long
          as needed to provide the service, subject to standard backup cycles.
        </p>

        <h2 className="pt-4 font-display text-xl text-ink">Contact</h2>
        <p>
          Questions about this policy can be sent to sapkotapranjal25@gmail.com.
        </p>
      </section>
    </div>
  );
}