import { ContentFrontmatter, FAQItem } from './content';

export const SITE_URL = 'https://fluxapply.me';
export const SITE_NAME = 'FluxApply';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    sameAs: [
      'https://twitter.com/fluxapply',
      'https://linkedin.com/company/fluxapply',
      'https://github.com/fluxapply',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@fluxapply.me',
      contactType: 'customer support',
    },
  };
}

export function generateWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: 'Tailor resumes, generate cover letters, and bypass ATS filters with FluxApply AI.',
    publisher: {
      '@id': `${SITE_URL}/#organization`,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function generateSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#application`,
    name: 'FluxApply AI Resume & Cover Letter Builder',
    operatingSystem: 'All',
    applicationCategory: 'BusinessApplication',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      ratingCount: '1240',
      bestRating: '5',
      worstRating: '1',
    },
    description:
      'AI-powered platform to tailor your resume to any job description, write tailored cover letters, and score ATS compatibility instantly.',
  };
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url.startsWith('/') ? '' : '/'}${item.url}`,
    })),
  };
}

export function generatePersonSchema(name: string, role = 'Career Coach & Content Strategist') {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    jobTitle: role,
    worksFor: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
  };
}

export function generateArticleSchema(frontmatter: ContentFrontmatter, collection: string) {
  const url = frontmatter.canonical || `${SITE_URL}/${collection}/${frontmatter.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${url}/#article`,
    isPartOf: {
      '@id': `${SITE_URL}/#website`,
    },
    headline: frontmatter.title,
    description: frontmatter.description,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    datePublished: frontmatter.publishedDate,
    dateModified: frontmatter.updatedDate,
    author: {
      '@type': 'Person',
      name: frontmatter.author || 'FluxApply Career Team',
    },
    publisher: {
      '@id': `${SITE_URL}/#organization`,
    },
    image: frontmatter.ogImage
      ? frontmatter.ogImage.startsWith('http')
        ? frontmatter.ogImage
        : `${SITE_URL}${frontmatter.ogImage}`
      : `${SITE_URL}/og-image.png`,
    keywords: frontmatter.keywords.join(', '),
  };
}

export function generateFAQSchema(faqs?: FAQItem[]) {
  if (!faqs || faqs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function generateCollectionSchema(
  title: string,
  description: string,
  url: string,
  itemsCount: number
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url,
    numberOfItems: itemsCount,
    publisher: {
      '@id': `${SITE_URL}/#organization`,
    },
  };
}
