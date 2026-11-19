import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { fetchUrl, sameSite, stripHash, pool, type FetchResult } from './util';
import { clean, type Page } from './page';

export interface Robots {
  sitemaps: string[];
  isBlocked(path: string): boolean;
}

/** Minimal robots.txt parser: groups, Allow/Disallow with longest match, * and $ wildcards. */
export function parseRobots(body: string): Robots {
  type Rule = { allow: boolean; path: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  const sitemaps: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.replace(/#.*$/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === 'sitemap') sitemaps.push(val);
      else if (cur && (key === 'allow' || key === 'disallow') && val) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const rules = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  const toRe = (p: string) => {
    const anchored = p.endsWith('$');
    const core = (anchored ? p.slice(0, -1) : p).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + core + (anchored ? '$' : ''));
  };
  return {
    sitemaps,
    isBlocked(path: string) {
      let best: Rule | null = null;
      for (const r of rules) {
        if (!toRe(r.path).test(path)) continue;
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
      }
      return best ? !best.allow : false;
    },
  };
}

export interface SitemapAlternate { loc: string; hreflang: string; href: string }

export function parseSitemapXml(xml: string) {
  const unesc = (s: string) => s.replace(/&amp;/g, '&').trim();
  const isIndex = /<sitemapindex/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => unesc(m[1]));
  const alternates: SitemapAlternate[] = [];
  if (!isIndex) {
    for (const block of xml.split(/<\/url>/i)) {
      const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
      if (!loc) continue;
      for (const m of block.matchAll(/<xhtml:link[^>]*>/gi)) {
        const hl = m[0].match(/hreflang=["']([^"']+)/i)?.[1];
        const href = m[0].match(/href=["']([^"']+)/i)?.[1];
        if (hl && href) alternates.push({ loc: unesc(loc), hreflang: hl, href: unesc(href) });
      }
    }
  }
  return { isIndex, locs, alternates };
}

export interface CrawledPage {
  url: string;
  status: number;
  title: string;
  description: string;
  noindex: boolean;
  timeMs: number;
  bytes: number;
}

export interface SiteInfo {
  origin: string;
  robots: Robots | null;
  robotsStatus: number;
  sitemap: { ok: boolean; url?: string; isIndex?: boolean; count?: string };
  sitemapUrls: string[];
  sitemapAlternates: SitemapAlternate[];
  pages: CrawledPage[];
}

export async function discoverSite(startUrl: string, log: (s: string) => void): Promise<Omit<SiteInfo, 'pages'>> {
  const origin = new URL(startUrl).origin;
  log('Reading robots.txt');
  const r = await fetchUrl(origin + '/robots.txt', { timeout: 10000 });
  const robots = r.status === 200 && !/<html/i.test(r.body.slice(0, 500)) ? parseRobots(r.body) : null;

  log('Looking for XML sitemaps');
  const candidates = [...new Set([...(robots?.sitemaps ?? []), origin + '/sitemap.xml', origin + '/sitemap_index.xml'])].slice(0, 5);
  let sitemap: SiteInfo['sitemap'] = { ok: false };
  let sitemapUrls: string[] = [];
  let sitemapAlternates: SitemapAlternate[] = [];
  for (const sm of candidates) {
    const s = await fetchUrl(sm, { timeout: 12000 });
    if (s.status !== 200 || !/<(urlset|sitemapindex)/i.test(s.body)) continue;
    const parsed = parseSitemapXml(s.body);
    sitemapUrls = parsed.locs;
    sitemapAlternates = parsed.alternates;
    if (parsed.isIndex && parsed.locs.length) {
      const child = await fetchUrl(parsed.locs[0], { timeout: 12000 });
      if (child.status === 200) {
        const c = parseSitemapXml(child.body);
        sitemapUrls = c.locs;
        sitemapAlternates = c.alternates;
      }
    }
    sitemap = {
      ok: true, url: sm, isIndex: parsed.isIndex,
      count: parsed.isIndex ? `${parsed.locs.length} child sitemaps` : `${parsed.locs.length} URLs`,
    };
    break;
  }
  return { origin, robots, robotsStatus: r.status, sitemap, sitemapUrls, sitemapAlternates };
}

function summarizePage(url: string, res: FetchResult, $: CheerioAPI): CrawledPage {
  return {
    url,
    status: res.status,
    title: clean($('head > title').first().text()),
    description: clean($('meta[name="description" i]').attr('content')),
    noindex: /noindex/i.test($('meta[name="robots" i]').attr('content') || '') || /noindex/i.test(res.headers['x-robots-tag'] || ''),
    timeMs: res.timeMs,
    bytes: res.bytes,
  };
}

export function extractInternal($: CheerioAPI, base: string): string[] {
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const abs = stripHash(new URL(href, base).href);
      if (sameSite(abs, base) && !/\.(pdf|jpe?g|png|gif|webp|avif|svg|zip|mp4|mp3|docx?|xlsx?)$/i.test(abs)) out.add(abs);
    } catch { /* ignore bad URLs */ }
  });
  return [...out];
}

/** Breadth-first crawl of internal HTML pages. */
export async function crawl(start: Page, maxPages: number, log: (s: string) => void): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [summarizePage(start.finalUrl, start.res, start.$)];
  if (maxPages <= 1) return pages;
  const seen = new Set([stripHash(start.finalUrl)]);
  let frontier = extractInternal(start.$, start.finalUrl);
  while (frontier.length && pages.length < maxPages) {
    const batch: string[] = [];
    for (const u of frontier) {
      if (seen.has(u)) continue;
      seen.add(u);
      batch.push(u);
      if (pages.length + batch.length >= maxPages) break;
    }
    frontier = [];
    if (!batch.length) break;
    await pool(batch, 6, async (u) => {
      const res = await fetchUrl(u, { timeout: 12000 });
      const ct = res.headers['content-type'] || '';
      if (res.status && !ct.includes('html')) return;
      const $ = cheerio.load(res.body);
      pages.push(summarizePage(u, res, $));
      log(`Crawled ${pages.length}/${maxPages} pages`);
      if (res.status === 200) frontier.push(...extractInternal($, res.finalUrl));
    });
  }
  return pages;
}
