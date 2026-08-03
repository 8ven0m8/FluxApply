import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ContentFrontmatter {
  title: string;
  description: string;
  slug: string;
  keywords: string[];
  category: string;
  author: string;
  publishedDate: string;
  updatedDate: string;
  readingTime: string;
  canonical: string;
  ogImage: string;
  faq?: FAQItem[];
  schemaType?: 'Article' | 'FAQPage' | 'SoftwareApplication' | 'Guide';
}

export type ContentCollection = 'blog' | 'resume' | 'companies' | 'features';

export interface ContentItem {
  frontmatter: ContentFrontmatter;
  content: string;
  collection: ContentCollection;
}

const CONTENT_BASE_PATH = path.join(process.cwd(), 'content');

export function getContentDirectory(collection: ContentCollection): string {
  return path.join(CONTENT_BASE_PATH, collection);
}

export function getAllContent(collection?: ContentCollection): ContentItem[] {
  const collectionsToRead: ContentCollection[] = collection
    ? [collection]
    : ['blog', 'resume', 'companies', 'features'];

  const allItems: ContentItem[] = [];

  for (const col of collectionsToRead) {
    const dir = getContentDirectory(col);
    if (!fs.existsSync(dir)) {
      continue;
    }

    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const filePath = path.join(dir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const { data, content } = matter(fileContent);

        const calculatedReadingTime = readingTime(content).text;

        const slug = data.slug || file.replace(/\.mdx?$/, '');
        const frontmatter: ContentFrontmatter = {
          title: data.title || 'Untitled',
          description: data.description || '',
          slug,
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          category: data.category || col,
          author: data.author || 'FluxApply Team',
          publishedDate: data.publishedDate || new Date().toISOString().split('T')[0],
          updatedDate: data.updatedDate || data.publishedDate || new Date().toISOString().split('T')[0],
          readingTime: data.readingTime || calculatedReadingTime,
          canonical: data.canonical || `https://fluxapply.me/${col}/${slug}`,
          ogImage: data.ogImage || '/images/og-default.png',
          faq: Array.isArray(data.faq) ? data.faq : [],
          schemaType: data.schemaType || (col === 'features' ? 'SoftwareApplication' : 'Article'),
        };

        allItems.push({
          frontmatter,
          content,
          collection: col,
        });
      }
    }
  }

  // Sort by updatedDate descending
  return allItems.sort((a, b) => 
    new Date(b.frontmatter.updatedDate).getTime() - new Date(a.frontmatter.updatedDate).getTime()
  );
}

export function getContentBySlug(collection: ContentCollection, slug: string): ContentItem | null {
  const items = getAllContent(collection);
  return items.find((item) => item.frontmatter.slug === slug) || null;
}

export function getAllSlugs(collection: ContentCollection): string[] {
  const items = getAllContent(collection);
  return items.map((item) => item.frontmatter.slug);
}

export function getRelatedContent(
  currentSlug: string,
  currentCollection: ContentCollection,
  limit: number = 6
): ContentItem[] {
  const currentItem = getContentBySlug(currentCollection, currentSlug);
  const allItems = getAllContent();

  if (!currentItem) {
    return allItems.filter((i) => i.frontmatter.slug !== currentSlug).slice(0, limit);
  }

  const currentKeywords = new Set(currentItem.frontmatter.keywords.map((k) => k.toLowerCase()));

  const scored = allItems
    .filter((item) => item.frontmatter.slug !== currentSlug)
    .map((item) => {
      let score = 0;
      // Category match
      if (item.collection === currentCollection) score += 3;
      if (item.frontmatter.category === currentItem.frontmatter.category) score += 5;

      // Keyword overlaps
      for (const kw of item.frontmatter.keywords) {
        if (currentKeywords.has(kw.toLowerCase())) {
          score += 2;
        }
      }

      return { item, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

export function searchContent(query: string, collection?: ContentCollection): ContentItem[] {
  const items = getAllContent(collection);
  if (!query || !query.trim()) return items;

  const q = query.toLowerCase().trim();

  return items.filter((item) => {
    const titleMatch = item.frontmatter.title.toLowerCase().includes(q);
    const descMatch = item.frontmatter.description.toLowerCase().includes(q);
    const slugMatch = item.frontmatter.slug.toLowerCase().includes(q);
    const kwMatch = item.frontmatter.keywords.some((k) => k.toLowerCase().includes(q));
    const contentMatch = item.content.toLowerCase().includes(q);

    return titleMatch || descMatch || slugMatch || kwMatch || contentMatch;
  });
}
