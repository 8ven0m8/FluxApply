import React from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface dark:bg-surface py-12 text-sm text-ink/80 dark:text-ink/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center space-x-2 font-black text-xl text-ink dark:text-ink">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-paper">
                <Sparkles className="h-4 w-4" />
              </div>
              <span>FluxApply</span>
            </Link>
            <p className="text-xs sm:text-sm text-ink/70 leading-relaxed max-w-sm">
              FluxApply helps job seekers tailor resumes to job descriptions, generate personalized cover letters, bypass ATS filters, and land more interviews.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-ink dark:text-ink mb-3 text-xs uppercase tracking-wider font-mono">
              Features
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/features/ai-resume-builder" className="hover:text-accent transition-colors">
                  AI Resume Builder
                </Link>
              </li>
              <li>
                <Link href="/features/cover-letter-generator" className="hover:text-accent transition-colors">
                  Cover Letter Generator
                </Link>
              </li>
              <li>
                <Link href="/features/ats-resume-checker" className="hover:text-accent transition-colors">
                  ATS Resume Checker
                </Link>
              </li>
              <li>
                <Link href="/features/job-description-analyzer" className="hover:text-accent transition-colors">
                  Job Description Analyzer
                </Link>
              </li>
              <li>
                <Link href="/features" className="text-accent font-semibold hover:underline">
                  All Features →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-ink dark:text-ink mb-3 text-xs uppercase tracking-wider font-mono">
              Resume Guides
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/resume/software-engineer" className="hover:text-accent transition-colors">
                  Software Engineer Resume
                </Link>
              </li>
              <li>
                <Link href="/resume/data-scientist" className="hover:text-accent transition-colors">
                  Data Scientist Resume
                </Link>
              </li>
              <li>
                <Link href="/resume/frontend-developer" className="hover:text-accent transition-colors">
                  Frontend Developer Resume
                </Link>
              </li>
              <li>
                <Link href="/resume/devops-engineer" className="hover:text-accent transition-colors">
                  DevOps Engineer Resume
                </Link>
              </li>
              <li>
                <Link href="/resume" className="text-accent font-semibold hover:underline">
                  All Resume Guides →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-ink dark:text-ink mb-3 text-xs uppercase tracking-wider font-mono">
              Company Guides
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/companies/google" className="hover:text-accent transition-colors">
                  Google Resume Guide
                </Link>
              </li>
              <li>
                <Link href="/companies/meta" className="hover:text-accent transition-colors">
                  Meta Resume Guide
                </Link>
              </li>
              <li>
                <Link href="/companies/amazon" className="hover:text-accent transition-colors">
                  Amazon Resume Guide
                </Link>
              </li>
              <li>
                <Link href="/companies/openai" className="hover:text-accent transition-colors">
                  OpenAI Resume Guide
                </Link>
              </li>
              <li>
                <Link href="/companies" className="text-accent font-semibold hover:underline">
                  All Company Guides →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-line pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-ink/60 gap-4">
          <p>© {new Date().getFullYear()} FluxApply. All rights reserved.</p>
          <div className="flex items-center space-x-6">
            <Link href="/blog" className="hover:text-accent">
              Blog
            </Link>
            <Link href="/search" className="hover:text-accent">
              Search
            </Link>
            <Link href="/privacy" className="hover:text-accent">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-accent">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
