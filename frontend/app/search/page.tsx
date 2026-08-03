import React, { Suspense } from 'react';
import Link from 'next/link';
import { searchContent, ContentItem } from '@/lib/content';
import { generateSeoMetadata } from '@/lib/seo';
import { generateOrganizationSchema, generateWebsiteSchema } from '@/lib/schema';
import JsonLd from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import Navbar from '@/components/content/Navbar';
import Footer from '@/components/content/Footer';
import SearchBar from '@/components/content/SearchBar';
import { Search, ArrowRight, Clock, FileText, Sparkles, Building2, BookOpen } from 'lucide-react';

export const metadata = generateSeoMetadata({
  title: 'Search Resume Guides, Features & Articles | FluxApply',
  description: 'Search across 100+ resume guides, company screeners, ATS optimization features, and career advice articles.',
  canonical: 'https://fluxapply.me/search',
});

interface PageProps {
  searchParams: Promise<{ q?: string; collection?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = '', collection } = await searchParams;
  const results = searchContent(q, collection as any);

  const schemas = [
    generateOrganizationSchema(),
    generateWebsiteSchema(),
  ];

  const collectionBadges = {
    blog: { label: 'Blog Post', icon: <BookOpen className="h-3.5 w-3.5" />, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    features: { label: 'Feature', icon: <Sparkles className="h-3.5 w-3.5" />, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    resume: { label: 'Resume Guide', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
    companies: { label: 'Company Guide', icon: <Building2 className="h-3.5 w-3.5" />, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  };

  return (
    <>
      <JsonLd data={schemas} />
      <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full space-y-10">
          <Breadcrumbs items={[{ name: 'Search', url: '/search' }]} />

          <header className="space-y-4 text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center space-x-2 text-accent font-bold text-sm">
              <Search className="h-5 w-5" />
              <span>Search Content Engine</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-ink dark:text-ink tracking-tight">
              Search Guides, Features & Articles
            </h1>
            <p className="text-base sm:text-lg text-ink/80 dark:text-ink/80 leading-relaxed">
              Find role-specific resume advice, company ATS guides, and features across our 100+ resource pages.
            </p>
            <div className="pt-2">
              <Suspense fallback={null}>
                <SearchBar initialQuery={q} placeholder="Search by title, role, company, or keyword..." />
              </Suspense>
            </div>
          </header>

          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-4 text-sm font-semibold">
              <span className="text-ink/80">
                {q ? `Found ${results.length} results for "${q}"` : `Showing all ${results.length} resources`}
              </span>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-16 space-y-4 bg-surface rounded-2xl border border-line p-8">
                <Search className="h-12 w-12 text-ink/30 mx-auto" />
                <h3 className="text-xl font-bold text-ink">No matching resources found</h3>
                <p className="text-sm text-ink/70 max-w-md mx-auto">
                  Try searching for keywords like &quot;Software Engineer&quot;, &quot;ATS Checker&quot;, &quot;Google&quot;, or &quot;Cover Letter&quot;.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {results.map((item: ContentItem) => {
                  const badge = collectionBadges[item.collection] || collectionBadges.blog;
                  const linkHref = `/${item.collection}/${item.frontmatter.slug}`;

                  return (
                    <article
                      key={`${item.collection}-${item.frontmatter.slug}`}
                      className="group flex flex-col justify-between rounded-2xl border border-line bg-surface dark:bg-surface p-7 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-accent/40"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold ${badge.color}`}
                          >
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>
                          <span className="text-xs text-ink/60 flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {item.frontmatter.readingTime}
                          </span>
                        </div>

                        <h2 className="text-xl font-bold text-ink dark:text-ink group-hover:text-accent transition-colors leading-snug">
                          <Link href={linkHref}>
                            {item.frontmatter.title}
                          </Link>
                        </h2>

                        <p className="text-sm text-ink/80 dark:text-ink/80 leading-relaxed line-clamp-3">
                          {item.frontmatter.description}
                        </p>
                      </div>

                      <div className="pt-6 mt-6 border-t border-line/60 flex items-center justify-between text-sm">
                        <span className="text-xs font-mono text-ink/60">{item.frontmatter.category}</span>
                        <Link
                          href={linkHref}
                          className="font-semibold text-accent group-hover:translate-x-1 transition-transform flex items-center"
                        >
                          <span>Read Resource</span>
                          <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
