/**
 * Blog posts from Blogger (blogger.com) through the Blogger API v3.
 *
 * Configure with environment variables (server-side only, never exposed to the browser):
 *   BLOGGER_API_KEY   an API key with the Blogger API v3 enabled (Google Cloud Console)
 *   BLOGGER_BLOG_ID   the blog's numeric ID, or instead
 *   BLOGGER_BLOG_URL  the blog's address, e.g. https://sightline-blog.blogspot.com
 *
 * Without them the blog renders an empty state and the build still succeeds.
 */
import 'server-only';
import * as cheerio from 'cheerio';

// BLOGGER_API_BASE exists only so builds can be tested against a local stand-in for the API.
const API = (process.env.BLOGGER_API_BASE || 'https://www.googleapis.com/blogger/v3').replace(/\/$/, '');
/** Re-fetch posts at most every 10 minutes on servers that support revalidation (Vercel, Docker). */
export const BLOG_REVALIDATE = 600;

export interface BlogPost {
  id: string;
  title: string;
  /** Path segments under /blogs, taken from the Blogger URL: /2026/11/my-post.html → ['2026', '11', 'my-post']. */
  year: string;
  month: string;
  slug: string;
  published: string;
  updated: string;
  author: string;
  labels: string[];
  image?: string;
  excerpt: string;
  /** Sanitised HTML body. */
  html: string;
}

interface ApiPost {
  id: string; title?: string; url: string; published: string; updated?: string; content?: string;
  labels?: string[]; images?: { url: string }[]; author?: { displayName?: string };
}

const key = () => process.env.BLOGGER_API_KEY?.trim() || '';
export const blogConfigured = (): boolean => Boolean(key() && (process.env.BLOGGER_BLOG_ID || process.env.BLOGGER_BLOG_URL));

async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries({ ...params, key: key() })) url.searchParams.set(k, v);
  const res = await fetch(url, { next: { revalidate: BLOG_REVALIDATE } });
  if (!res.ok) {
    // Never echo the URL: it contains the API key.
    const reason = await res.json().then((b: { error?: { message?: string } }) => b.error?.message).catch(() => '');
    throw new Error(`Blogger API ${path.split('?')[0]} failed: ${res.status} ${reason || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

let blogId: Promise<string> | undefined;
function resolveBlogId(): Promise<string> {
  const id = process.env.BLOGGER_BLOG_ID?.trim();
  if (id) return Promise.resolve(id);
  blogId ??= api<{ id: string }>('/blogs/byurl', { url: process.env.BLOGGER_BLOG_URL!.trim() }).then((b) => b.id);
  return blogId;
}

/** Removes scripts, inline event handlers, javascript: links and non-video iframes from post HTML. */
export function sanitize(html: string): string {
  const $ = cheerio.load(html, null, false);
  $('script, object, embed, form, base, meta, link').remove();
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//.test(src)) $(el).remove();
    else $(el).attr('loading', 'lazy');
  });
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    for (const name of Object.keys(el.attribs)) {
      const value = el.attribs[name];
      if (/^on/i.test(name) || ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(value) && !/^data:image\//i.test(value))) {
        $(el).removeAttr(name);
      }
    }
  });
  $('img').attr('loading', 'lazy').attr('decoding', 'async');
  $('a[href^="http"]').each((_, el) => { $(el).attr('rel', 'noopener'); });
  return $.html();
}

/** Plain-text summary of a post body. */
export function excerpt(html: string, max = 180): string {
  const $ = cheerio.load(html, null, false);
  $('script, style, noscript, iframe, figcaption').remove();
  // Keep words in separate blocks apart ("…trust.</p><p>Check…" → "trust. Check").
  $('p, div, li, br, h1, h2, h3, h4, h5, h6, blockquote, td, th').after(' ');
  const text = $.root().text().replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/** Maps a Blogger post to ours. Returns undefined for posts whose URL is not /YYYY/MM/slug.html. */
export function toPost(p: ApiPost): BlogPost | undefined {
  const m = new URL(p.url).pathname.match(/^\/(\d{4})\/(\d{2})\/([^/]+?)(?:\.html)?$/);
  if (!m) return undefined;
  const body = p.content || '';
  const firstImg = p.images?.[0]?.url || cheerio.load(body, null, false)('img').first().attr('src');
  return {
    id: p.id, title: p.title?.trim() || 'Untitled', year: m[1], month: m[2], slug: m[3],
    published: p.published, updated: p.updated || p.published, author: p.author?.displayName || 'Sightline',
    labels: p.labels || [], image: firstImg?.startsWith('https://') ? firstImg : undefined,
    excerpt: excerpt(body), html: sanitize(body),
  };
}

/** All live posts, newest first. Empty when the blog is not configured. */
export async function getPosts(): Promise<BlogPost[]> {
  if (!blogConfigured()) return [];
  const id = await resolveBlogId();
  const posts: BlogPost[] = [];
  let pageToken = '';
  for (let page = 0; page < 20; page++) {
    const res = await api<{ items?: ApiPost[]; nextPageToken?: string }>(`/blogs/${id}/posts`, {
      maxResults: '50', fetchBodies: 'true', fetchImages: 'true', status: 'live', orderBy: 'published',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const p of res.items || []) { const post = toPost(p); if (post) posts.push(post); }
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return posts;
}

export async function getPost(year: string, month: string, slug: string): Promise<BlogPost | undefined> {
  return (await getPosts()).find((p) => p.year === year && p.month === month && p.slug === slug);
}

export const postPath = (p: Pick<BlogPost, 'year' | 'month' | 'slug'>): string => `/blogs/${p.year}/${p.month}/${p.slug}`;

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
