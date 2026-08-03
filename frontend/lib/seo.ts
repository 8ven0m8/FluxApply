import type { Metadata } from 'next';
import { ContentFrontmatter } from './content';

export const SITE_NAME = 'FluxApply';
export const SITE_URL = 'https://fluxapply.me';
export const DEFAULT_OG_IMAGE = 'https://fluxapply.me/og-image.png';
export const DEFAULT_TWITTER_HANDLE = '@fluxapply';

export interface SeoMetadataOptions {
  title: string;
  description: string;
  slug?: string;
  canonical?: string;
  ogImage?: string;
  keywords?: string[];
  publishedDate?: string;
  updatedDate?: string;
  author?: string;
  noIndex?: boolean;
  type?: 'website' | 'article';
}

export function generateSeoMetadata(options: SeoMetadataOptions): Metadata {
  const {
    title,
    description,
    canonical,
    ogImage,
    keywords = [],
    publishedDate,
    updatedDate,
    author = 'FluxApply Team',
    noIndex = false,
    type = 'website',
  } = options;

  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical || SITE_URL;
  const imageUrl = ogImage
    ? ogImage.startsWith('http')
      ? ogImage
      : `${SITE_URL}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`
    : DEFAULT_OG_IMAGE;

  const defaultKeywords = [
    'AI resume builder',
    'cover letter generator',
    'ATS resume checker',
    'job application assistant',
    'tailor resume to job description',
    'resume optimization',
    ...keywords,
  ];

  return {
    title: fullTitle,
    description,
    keywords: defaultKeywords,
    authors: [{ name: author }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'en_US',
      type: type,
      ...(publishedDate && { publishedTime: publishedDate }),
      ...(updatedDate && { modifiedTime: updatedDate }),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [imageUrl],
      creator: DEFAULT_TWITTER_HANDLE,
    },
  };
}

export function generateSeoFromFrontmatter(
  frontmatter: ContentFrontmatter,
  collection: string
): Metadata {
  return generateSeoMetadata({
    title: frontmatter.title,
    description: frontmatter.description,
    canonical: frontmatter.canonical || `${SITE_URL}/${collection}/${frontmatter.slug}`,
    ogImage: frontmatter.ogImage,
    keywords: frontmatter.keywords,
    publishedDate: frontmatter.publishedDate,
    updatedDate: frontmatter.updatedDate,
    author: frontmatter.author,
    type: 'article',
  });
}
