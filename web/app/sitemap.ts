import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/app`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/llms.txt`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
