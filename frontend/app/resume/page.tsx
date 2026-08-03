import React from 'react';
import Link from 'next/link';
import { getAllContent } from '@/lib/content';
import { generateSeoMetadata } from '@/lib/seo';
import { generateCollectionSchema, generateOrganizationSchema, generateWebsiteSchema } from '@/lib/schema';
import JsonLd from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import Navbar from '@/components/content/Navbar';
import Footer from '@/components/content/Footer';
import SearchBar from '@/components/content/SearchBar';
import { FileText, ArrowRight, Clock } from 'lucide-react';

export const metadata = generateSeoMetadata({
  title: '30+ Role-Specific Resume Guides & ATS Keywords | FluxApply',
  description: 'Role-specific resume guides for Software Engineers, Data Scientists, DevOps, Product Managers, and 30+ tech job titles.',
  canonical: 'https://fluxapply.me/resume',
  keywords: ['software engineer resume guide', 'data scientist resume keywords', 'devops resume ATS', 'tech resume examples'],
});

export default function ResumeGuidesIndexPage() {
  const items = getAllContent('resume');

  const schemas = [
    generateOrganizationSchema(),
    generateWebsiteSchema(),
    generateCollectionSchema(
      'Role-Specific Tech Resume Guides',
      'Comprehensive library of role-specific resume writing guides with top ATS keywords and metrics.',
      'https://fluxapply.me/resume',
      items.length
    ),
  ];

  return (
    <>
      <JsonLd data={schemas} />
      <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full space-y-10">
          <Breadcrumbs items={[{ name: 'Resume Guides', url: '/resume' }]} />

          <header className="space-y-4 text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-accent/15 text-accent font-mono">
              <FileText className="h-3.5 w-3.5 mr-1" />
              Role-Specific Guides
            </span>
            <h1 className="text-3xl sm:text-5xl font-black text-ink dark:text-ink tracking-tight">
              Resume Writing Guides for Top Tech Roles
            </h1>
            <p className="text-base sm:text-lg text-ink/80 dark:text-ink/80 leading-relaxed">
              Step-by-step resume breakdowns packed with industry ATS keywords, formulaic bullet points, and real recruiter advice.
            </p>
            <div className="pt-2">
              <SearchBar placeholder="Search by role (e.g. Data Scientist, DevOps, Frontend)..." />
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {items.map((item) => (
              <article
                key={item.frontmatter.slug}
                className="group flex flex-col justify-between rounded-2xl border border-line bg-surface dark:bg-surface p-7 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-accent/40"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      {item.frontmatter.category}
                    </span>
                    <span className="text-xs text-ink/60 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {item.frontmatter.readingTime}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-ink dark:text-ink group-hover:text-accent transition-colors leading-snug">
                    <Link href={`/resume/${item.frontmatter.slug}`}>
                      {item.frontmatter.title}
                    </Link>
                  </h2>

                  <p className="text-sm text-ink/80 dark:text-ink/80 leading-relaxed line-clamp-3">
                    {item.frontmatter.description}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-line/60 flex items-center justify-between text-sm">
                  <span className="text-xs font-mono text-ink/60">Updated 2026</span>
                  <Link
                    href={`/resume/${item.frontmatter.slug}`}
                    className="font-semibold text-accent group-hover:translate-x-1 transition-transform flex items-center"
                  >
                    <span>Read Guide</span>
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
