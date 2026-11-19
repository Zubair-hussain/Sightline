import { check, category } from './util';
import { clean, type Page } from './page';
import type { SiteInfo } from './site';

export interface SeoData {
  title: string;
  description: string;
  h1: string;
  words: number;
  lang: string;
  schemaTypes: string[];
  pagesCrawled: number;
}

export function auditSeo(page: Page, site: SiteInfo): SL.Category<SeoData> {
  const { $, finalUrl, headers } = page;
  const checks: SL.Check[] = [];

  // Title
  const title = clean($('head > title').first().text());
  if (!title) {
    checks.push(check('seo.title', 'Page title', 'fail', 'No <title> element found.', { weight: 3, fix: 'Add a unique, descriptive <title> of 30–60 characters.' }));
  } else if (title.length < 30 || title.length > 60) {
    checks.push(check('seo.title', 'Page title', 'warn', `"${title}" is ${title.length} characters (ideal 30–60).`, { weight: 3, fix: 'Rewrite the title to 30–60 characters so it is not truncated in results.' }));
  } else {
    checks.push(check('seo.title', 'Page title', 'pass', `"${title}" (${title.length} chars)`, { weight: 3 }));
  }
  const titleCount = $('title').length;
  if (titleCount > 1) checks.push(check('seo.title-multi', 'Single title element', 'warn', `${titleCount} <title> elements found.`, { fix: 'Keep exactly one <title> in <head>.' }));

  // Meta description
  const desc = clean($('meta[name="description" i]').attr('content'));
  if (!desc) checks.push(check('seo.description', 'Meta description', 'fail', 'Missing meta description.', { weight: 2, fix: 'Add a 70–160 character description summarising the page.' }));
  else if (desc.length < 70 || desc.length > 160) checks.push(check('seo.description', 'Meta description', 'warn', `${desc.length} characters (ideal 70–160).`, { weight: 2, fix: 'Adjust the description to 70–160 characters.' }));
  else checks.push(check('seo.description', 'Meta description', 'pass', `${desc.length} characters.`, { weight: 2 }));

  // H1 and heading hierarchy
  const h1s = $('h1').map((_, el) => clean($(el).text())).get().filter(Boolean);
  if (h1s.length === 0) checks.push(check('seo.h1', 'H1 heading', 'fail', 'No <h1> on the page.', { weight: 2, fix: 'Add one <h1> describing the main topic.' }));
  else if (h1s.length > 1) checks.push(check('seo.h1', 'H1 heading', 'warn', `${h1s.length} <h1> elements.`, { weight: 2, items: h1s.slice(0, 10), fix: 'Use a single <h1>; demote the rest to <h2>.' }));
  else checks.push(check('seo.h1', 'H1 heading', 'pass', `"${h1s[0].slice(0, 90)}"`, { weight: 2 }));

  const levels = $('h1,h2,h3,h4,h5,h6').map((_, el) => Number((el as { tagName: string }).tagName.slice(1))).get();
  const skips = new Set<string>();
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skips.add(`h${levels[i - 1]} → h${levels[i]}`);
  checks.push(skips.size
    ? check('seo.headings', 'Heading hierarchy', 'warn', `${skips.size} kind(s) of skipped heading level.`, { items: [...skips], fix: 'Do not skip levels (e.g. h2 straight to h4).' })
    : check('seo.headings', 'Heading hierarchy', 'pass', `${levels.length} headings in logical order.`));

  // Canonical
  const canonicals = $('link[rel="canonical" i]').map((_, el) => $(el).attr('href') || '').get();
  if (canonicals.length === 0) {
    checks.push(check('seo.canonical', 'Canonical URL', 'warn', 'No canonical link.', { weight: 2, fix: 'Add <link rel="canonical" href="…"> pointing to the preferred URL.' }));
  } else if (canonicals.length > 1) {
    checks.push(check('seo.canonical', 'Canonical URL', 'fail', 'Multiple canonical tags conflict.', { weight: 2, items: canonicals }));
  } else {
    const abs = new URL(canonicals[0], finalUrl).href;
    const self = abs.replace(/\/$/, '') === finalUrl.replace(/\/$/, '');
    checks.push(check('seo.canonical', 'Canonical URL', self ? 'pass' : 'info', self ? 'Self-referencing canonical.' : `Canonicalised to ${abs}`, { weight: 2 }));
  }

  // Indexability
  const robotsMeta = ($('meta[name="robots" i]').attr('content') || '').toLowerCase();
  const xRobots = (headers['x-robots-tag'] || '').toLowerCase();
  const noindex = robotsMeta.includes('noindex') || xRobots.includes('noindex');
  checks.push(noindex
    ? check('seo.indexable', 'Indexable', 'fail', `Page is set to noindex (${robotsMeta || 'X-Robots-Tag: ' + xRobots}).`, { weight: 3, fix: 'Remove noindex if this page should appear in search.' })
    : check('seo.indexable', 'Indexable', 'pass', 'No noindex directive.', { weight: 3 }));
  if (site.robots) {
    checks.push(site.robots.isBlocked(new URL(finalUrl).pathname)
      ? check('seo.robots-block', 'Allowed by robots.txt', 'fail', 'robots.txt disallows this URL for all crawlers.', { weight: 3 })
      : check('seo.robots-block', 'Allowed by robots.txt', 'pass', 'Crawlable under robots.txt rules.', { weight: 3 }));
  }

  // Language
  const lang = $('html').attr('lang') || '';
  checks.push(lang
    ? check('seo.lang', 'Document language', 'pass', `lang="${lang}"`)
    : check('seo.lang', 'Document language', 'warn', 'Missing <html lang>.', { fix: 'Add lang (e.g. <html lang="en">) for search engines and screen readers.' }));

  // Image alt text
  const imgs = $('img');
  const noAlt = imgs.filter((_, el) => $(el).attr('alt') === undefined).map((_, el) => $(el).attr('src') || '(inline)').get();
  if (imgs.length === 0) checks.push(check('seo.alt', 'Image alt text', 'info', 'No <img> elements in the HTML.'));
  else checks.push(noAlt.length
    ? check('seo.alt', 'Image alt text', noAlt.length / imgs.length > 0.2 ? 'fail' : 'warn', `${noAlt.length} of ${imgs.length} images missing alt.`, { items: noAlt.slice(0, 25), fix: 'Add descriptive alt text (alt="" for decorative images).' })
    : check('seo.alt', 'Image alt text', 'pass', `All ${imgs.length} images have alt attributes.`));

  // Content depth
  const body = $('body').clone();
  body.find('script,style,noscript,svg,template').remove();
  const words = clean(body.text()).split(' ').filter((w) => /\p{L}/u.test(w)).length;
  checks.push(words < 300
    ? check('seo.content', 'Content depth', words < 100 ? 'fail' : 'warn', `${words} words of visible text in the HTML.`, { fix: 'Thin pages rank poorly; aim for 300+ useful words. If content is rendered by JavaScript, consider server-side rendering.' })
    : check('seo.content', 'Content depth', 'pass', `${words} words of visible text.`));

  // Social previews
  const missingOg = ['og:title', 'og:description', 'og:image', 'og:url'].filter((p) => !$(`meta[property="${p}"]`).attr('content'));
  checks.push(missingOg.length
    ? check('seo.og', 'Open Graph tags', missingOg.length > 2 ? 'fail' : 'warn', `Missing: ${missingOg.join(', ')}`, { fix: 'Add Open Graph tags so links render rich previews when shared.' })
    : check('seo.og', 'Open Graph tags', 'pass', 'og:title, og:description, og:image and og:url present.'));
  const tw = $('meta[name="twitter:card"]').attr('content');
  checks.push(tw
    ? check('seo.twitter', 'Twitter / X card', 'pass', `twitter:card = ${tw}`, { weight: 0.5 })
    : check('seo.twitter', 'Twitter / X card', 'warn', 'No twitter:card meta.', { weight: 0.5 }));

  // Structured data
  const types: string[] = [];
  const ldErrors: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n && typeof n === 'object') {
          const o = n as Record<string, unknown>;
          if (o['@type']) types.push(([] as unknown[]).concat(o['@type']).join('/'));
          if (o['@graph']) walk(o['@graph']);
        }
      };
      walk(JSON.parse($(el).contents().text()));
    } catch (e) { ldErrors.push((e as Error).message); }
  });
  const uniqueTypes = [...new Set(types)];
  if (ldErrors.length) checks.push(check('seo.schema', 'Structured data (JSON-LD)', 'fail', `${ldErrors.length} JSON-LD block(s) fail to parse.`, { items: ldErrors, weight: 1.5 }));
  else if (uniqueTypes.length) checks.push(check('seo.schema', 'Structured data (JSON-LD)', 'pass', `Types: ${uniqueTypes.join(', ')}`, { weight: 1.5 }));
  else checks.push(check('seo.schema', 'Structured data (JSON-LD)', 'warn', 'No JSON-LD structured data.', { weight: 1.5, fix: 'Add schema.org JSON-LD (Organization, WebSite, Article, Product…) for rich results.' }));

  // URL hygiene
  const u = new URL(finalUrl);
  const urlIssues: string[] = [];
  if (/[A-Z]/.test(u.pathname)) urlIssues.push('uppercase characters');
  if (u.pathname.includes('_')) urlIssues.push('underscores');
  if (u.pathname.length > 100) urlIssues.push('more than 100 characters');
  if (u.searchParams.size > 3) urlIssues.push('many query parameters');
  checks.push(urlIssues.length
    ? check('seo.url', 'URL structure', 'warn', `URL has ${urlIssues.join(', ')}.`, { weight: 0.5 })
    : check('seo.url', 'URL structure', 'pass', 'Clean, readable URL.', { weight: 0.5 }));

  // Site-level files
  checks.push(site.robotsStatus === 200
    ? check('seo.robots', 'robots.txt', 'pass', `Found, ${site.robots?.sitemaps.length ?? 0} sitemap reference(s).`)
    : check('seo.robots', 'robots.txt', 'warn', `robots.txt returned ${site.robotsStatus || 'no response'}.`, { fix: 'Publish /robots.txt with a Sitemap: line.' }));
  checks.push(site.sitemap.ok
    ? check('seo.sitemap', 'XML sitemap', 'pass', `${site.sitemap.url} — ${site.sitemap.count}.`, { weight: 1.5 })
    : check('seo.sitemap', 'XML sitemap', 'fail', 'No valid XML sitemap found.', { weight: 1.5, fix: 'Generate sitemap.xml and reference it from robots.txt.' }));
  if (site.sitemap.ok && site.sitemapUrls.length && !site.sitemapUrls.some((s) => s.replace(/\/$/, '') === finalUrl.replace(/\/$/, ''))) {
    checks.push(check('seo.in-sitemap', 'Page listed in sitemap', 'info', 'This URL was not found in the first sitemap file.'));
  }

  // Crawl-wide checks
  const pages = site.pages;
  if (pages.length > 1) {
    const dupes = (key: 'title' | 'description') => {
      const m = new Map<string, string[]>();
      for (const p of pages) if (p[key]) m.set(p[key], [...(m.get(p[key]) ?? []), p.url]);
      return [...m.entries()].filter(([, urls]) => urls.length > 1);
    };
    const dt = dupes('title');
    const dd = dupes('description');
    checks.push(dt.length
      ? check('seo.dup-title', 'Unique titles across site', 'warn', `${dt.length} title(s) reused on multiple pages.`, { items: dt.slice(0, 15).map(([t, u2]) => `"${t}" × ${u2.length}`) })
      : check('seo.dup-title', 'Unique titles across site', 'pass', `${pages.length} crawled pages have unique titles.`));
    checks.push(dd.length
      ? check('seo.dup-desc', 'Unique descriptions across site', 'warn', `${dd.length} description(s) reused.`, { items: dd.slice(0, 15).map(([t, u2]) => `"${t.slice(0, 60)}…" × ${u2.length}`) })
      : check('seo.dup-desc', 'Unique descriptions across site', 'pass', 'Descriptions are unique across crawled pages.'));
    const broken = pages.filter((p) => p.status >= 400 || p.status === 0);
    checks.push(broken.length
      ? check('seo.crawl-status', 'Crawled pages healthy', 'fail', `${broken.length} internal page(s) return errors.`, { weight: 2, items: broken.map((p) => `${p.status || 'ERR'}  ${p.url}`) })
      : check('seo.crawl-status', 'Crawled pages healthy', 'pass', `All ${pages.length} crawled pages respond successfully.`, { weight: 2 }));
    const slow = pages.filter((p) => p.timeMs > 2000);
    if (slow.length) checks.push(check('seo.crawl-slow', 'Slow pages', 'warn', `${slow.length} page(s) took over 2 s to respond.`, { items: slow.map((p) => `${p.timeMs} ms  ${p.url}`) }));
    const ni = pages.filter((p) => p.noindex);
    if (ni.length) checks.push(check('seo.crawl-noindex', 'Noindex pages in crawl', 'info', `${ni.length} crawled page(s) are noindex.`, { items: ni.map((p) => p.url) }));
  }

  return category('seo', checks, { title, description: desc, h1: h1s[0] ?? '', words, lang, schemaTypes: uniqueTypes, pagesCrawled: pages.length });
}
