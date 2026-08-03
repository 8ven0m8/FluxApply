import React from 'react';
import Link from 'next/link';
import { ContentItem } from '@/lib/content';
import { ArrowRight, BookOpen, Sparkles, Building2, FileText, Clock } from 'lucide-react';

interface RelatedContentProps {
  relatedItems: ContentItem[];
  title?: string;
}

export default function RelatedContent({
  relatedItems,
  title = 'Explore Related Resources',
}: RelatedContentProps) {
  if (!relatedItems || relatedItems.length === 0) return null;

  const collectionBadges = {
    blog: { label: 'Blog Post', icon: <BookOpen className="h-3.5 w-3.5" />, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    features: { label: 'Feature', icon: <Sparkles className="h-3.5 w-3.5" />, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    resume: { label: 'Resume Guide', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
    companies: { label: 'Company Guide', icon: <Building2 className="h-3.5 w-3.5" />, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  };

  return (
    <section aria-labelledby="related-content-heading" className="my-14 border-t border-line pt-10">
      <div className="flex items-center justify-between mb-8">
        <h2 id="related-content-heading" className="text-2xl font-bold text-ink dark:text-ink">
          {title}
        </h2>
        <Link
          href="/search"
          className="text-sm font-semibold text-accent hover:underline flex items-center"
        >
          <span>View All Content</span>
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {relatedItems.map((item) => {
          const badge = collectionBadges[item.collection] || collectionBadges.blog;
          const linkHref = `/${item.collection}/${item.frontmatter.slug}`;

          return (
            <article
              key={`${item.collection}-${item.frontmatter.slug}`}
              className="group flex flex-col justify-between rounded-xl border border-line bg-surface dark:bg-surface p-6 transition-all duration-200 hover:shadow-md hover:border-accent/40"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${badge.color}`}
                  >
                    {badge.icon}
                    <span>{badge.label}</span>
                  </span>
                  <span className="flex items-center text-xs text-ink/60">
                    <Clock className="h-3 w-3 mr-1 inline" />
                    {item.frontmatter.readingTime}
                  </span>
                </div>

                <h3 className="font-bold text-base text-ink dark:text-ink group-hover:text-accent transition-colors line-clamp-2 leading-snug">
                  <Link href={linkHref}>
                    {item.frontmatter.title}
                  </Link>
                </h3>

                <p className="text-xs text-ink/75 dark:text-ink/75 line-clamp-3 leading-relaxed">
                  {item.frontmatter.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-line/50 flex items-center justify-between text-xs">
                <span className="text-ink/60">{item.frontmatter.category}</span>
                <Link
                  href={linkHref}
                  className="font-semibold text-accent group-hover:translate-x-0.5 transition-transform flex items-center"
                >
                  <span>Read Guide</span>
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
