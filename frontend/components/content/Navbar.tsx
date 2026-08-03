'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, Search } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-paper/80 dark:bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <Link href="/" className="flex items-center space-x-2 font-black text-xl tracking-tight text-ink dark:text-ink">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-paper">
            <Sparkles className="h-4 w-4" />
          </div>
          <span>FluxApply</span>
        </Link>

        <nav aria-label="Main Navigation" className="hidden md:flex items-center space-x-8 text-sm font-medium text-ink/80 dark:text-ink/80">
          <Link href="/features" className="hover:text-accent transition-colors">
            Features
          </Link>
          <Link href="/resume" className="hover:text-accent transition-colors">
            Resume Guides
          </Link>
          <Link href="/companies" className="hover:text-accent transition-colors">
            Company Guides
          </Link>
          <Link href="/blog" className="hover:text-accent transition-colors">
            Blog
          </Link>
        </nav>

        <div className="flex items-center space-x-4">
          <Link
            href="/search"
            className="p-2 rounded-lg text-ink/70 hover:text-accent hover:bg-accent/10 transition-colors"
            title="Search content"
            aria-label="Search content"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-accent text-paper text-sm font-semibold hover:bg-accentDark transition-colors shadow-sm"
          >
            Start Free
          </Link>
        </div>
      </div>
    </header>
  );
}
