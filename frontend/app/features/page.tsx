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
import { Sparkles, ArrowRight, Clock } from 'lucide-react';

export const metadata = generateSeoMetadata({
  title: 'AI Resume & Cover Letter Features | FluxApply',
  description: 'Explore FluxApply AI tools for resume tailoring, ATS checking, cover letter generation, and job description analysis.',
  canonical: 'https://fluxapply.me/features',
  keywords: ['AI resume features', 'ATS checker tool', 'cover letter generator', 'job description analyzer'],
});

export default function FeaturesIndexPage() {
  const items = getAllContent('features');

  const schemas = [
    generateOrganizationSchema(),
    generateWebsiteSchema(),
    generateCollectionSchema(
      'FluxApply AI Resume Features',
      'Suite of AI features designed to optimize your resume and cover letter for any job.',
      'https://fluxapply.me/features',
      items.length
    ),
  ];

  return (
    <>
      <JsonLd data={schemas} />
      <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full space-y-10">
          <Breadcrumbs items={[{ name: 'Features', url: '/features' }]} />

          <header className="space-y-4 text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-accent/15 text-accent font-mono">
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              AI Tools & Capabilities
            </span>
            <h1 className="text-3xl sm:text-5xl font-black text-ink dark:text-ink tracking-tight">
              Features Built to Double Your Interviews
            </h1>
            <p className="text-base sm:text-lg text-ink/80 dark:text-ink/80 leading-relaxed">
              From instant ATS keyword optimization to AI-powered cover letter generation, discover the tools that give job seekers an unfair advantage.
            </p>
            <div className="pt-2">
              <SearchBar placeholder="Search features (e.g. ATS checker, bullet enhancer)..." />
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
                    <span className="px-3 py-1 rounded-md text-xs font-semibold bg-accent/10 text-accent">
                      {item.frontmatter.category}
                    </span>
                    <span className="text-xs text-ink/60 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {item.frontmatter.readingTime}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-ink dark:text-ink group-hover:text-accent transition-colors leading-snug">
                    <Link href={`/features/${item.frontmatter.slug}`}>
                      {item.frontmatter.title}
                    </Link>
                  </h2>

                  <p className="text-sm text-ink/80 dark:text-ink/80 leading-relaxed line-clamp-3">
                    {item.frontmatter.description}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-line/60 flex items-center justify-between text-sm">
                  <span className="text-xs font-mono text-ink/60">{item.frontmatter.author}</span>
                  <Link
                    href={`/features/${item.frontmatter.slug}`}
                    className="font-semibold text-accent group-hover:translate-x-1 transition-transform flex items-center"
                  >
                    <span>Explore Feature</span>
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
