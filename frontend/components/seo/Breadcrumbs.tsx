import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import JsonLd from './JsonLd';
import { generateBreadcrumbSchema, BreadcrumbItem } from '@/lib/schema';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [
    { name: 'Home', url: '/' },
    ...items,
  ];

  const schema = generateBreadcrumbSchema(allItems);

  return (
    <>
      <JsonLd data={schema} />
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink/70 dark:text-ink/70">
        {allItems.map((item, idx) => {
          const isLast = idx === allItems.length - 1;
          return (
            <React.Fragment key={item.url}>
              {idx > 0 && <ChevronRight className="h-4 w-4 text-ink/40" />}
              {isLast ? (
                <span className="font-semibold text-ink dark:text-ink truncate max-w-[240px] md:max-w-none" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.url}
                  className="flex items-center hover:text-accent transition-colors underline-offset-4 hover:underline"
                >
                  {idx === 0 && <Home className="mr-1 h-3.5 w-3.5 inline" />}
                  <span>{item.name}</span>
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>
    </>
  );
}
