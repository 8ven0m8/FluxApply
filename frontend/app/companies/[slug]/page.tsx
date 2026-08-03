import React from 'react';
import { notFound } from 'next/navigation';
import { getContentBySlug, getAllSlugs, getRelatedContent } from '@/lib/content';
import { generateSeoFromFrontmatter } from '@/lib/seo';
import {
  generateOrganizationSchema,
  generateWebsiteSchema,
  generateArticleSchema,
  generateFAQSchema,
} from '@/lib/schema';
import JsonLd from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import ContentHero from '@/components/content/ContentHero';
import TableOfContents from '@/components/content/TableOfContents';
import MDXRemoteWrapper from '@/components/mdx/MDXRemoteWrapper';
import RelatedContent from '@/components/content/RelatedContent';
import Navbar from '@/components/content/Navbar';
import Footer from '@/components/content/Footer';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllSlugs('companies');
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const item = getContentBySlug('companies', slug);
  if (!item) return {};

  return generateSeoFromFrontmatter(item.frontmatter, 'companies');
}

export default async function CompanyGuidePage({ params }: PageProps) {
  const { slug } = await params;
  const item = getContentBySlug('companies', slug);

  if (!item) {
    notFound();
  }

  const related = getRelatedContent(slug, 'companies', 6);

  const schemas = [
    generateOrganizationSchema(),
    generateWebsiteSchema(),
    generateArticleSchema(item.frontmatter, 'companies'),
    generateFAQSchema(item.frontmatter.faq),
  ];

  return (
    <>
      <JsonLd data={schemas} />
      <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
        <Navbar />
        <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
          <Breadcrumbs
            items={[
              { name: 'Company Guides', url: '/companies' },
              { name: item.frontmatter.title, url: `/companies/${slug}` },
            ]}
          />

          <ContentHero frontmatter={item.frontmatter} collection="companies" />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10 items-start">
            <aside className="lg:col-span-1 lg:sticky lg:top-24 order-2 lg:order-1">
              <TableOfContents content={item.content} />
            </aside>

            <article className="lg:col-span-3 order-1 lg:order-2">
              <MDXRemoteWrapper source={item.content} />
            </article>
          </div>

          <RelatedContent relatedItems={related} title="Company Resume Guides & Insider Tips" />
        </main>
        <Footer />
      </div>
    </>
  );
}
