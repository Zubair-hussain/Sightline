import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content';
import { getPosts, postPath } from '@/lib/blogger';

export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const posts = await getPosts().catch(() => []);
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/app`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/blogs`, lastModified: posts[0] ? new Date(posts[0].updated) : now, changeFrequency: 'daily', priority: 0.7 },
    ...posts.map((p) => ({ url: `${SITE_URL}${postPath(p)}`, lastModified: new Date(p.updated), changeFrequency: 'monthly' as const, priority: 0.6 })),
    { url: `${SITE_URL}/llms.txt`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
