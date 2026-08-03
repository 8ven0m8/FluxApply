import { MetadataRoute } from 'next';
import { getAllContent } from '@/lib/content';
import { SITE_URL } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const allItems = getAllContent();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/features`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/resume`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/companies`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

  const contentRoutes: MetadataRoute.Sitemap = allItems.map((item) => {
    let priority = 0.8;
    if (item.collection === 'features') priority = 0.95;
    if (item.collection === 'resume') priority = 0.9;
    if (item.collection === 'companies') priority = 0.85;

    return {
      url: `${SITE_URL}/${item.collection}/${item.frontmatter.slug}`,
      lastModified: new Date(item.frontmatter.updatedDate || item.frontmatter.publishedDate),
      changeFrequency: 'weekly',
      priority,
    };
  });

  return [...staticRoutes, ...contentRoutes];
}
