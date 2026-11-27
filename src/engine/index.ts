import { normalizeInputUrl, failedCategory } from './util';
import { loadPage, clean } from './page';
import { discoverSite, crawl, type SiteInfo } from './site';
import { auditSeo } from './seo';
import { auditHreflang } from './hreflang';
import { auditLinks } from './links';
import { auditWebsite } from './website';
import { auditCloudflare } from './cloudflare';
import { auditSecurity } from './security';
import { resolveBrand } from './brand';
import { generateTestCases } from './testcases';

export const VERSION = '1.0.0';

export const ALL_MODULES: SL.CategoryKey[] = ['seo', 'hreflang', 'links', 'website', 'performance', 'lighthouse', 'coverage', 'cloudflare', 'security', 'mobile', 'memory'];
export const BROWSER_MODULES: SL.CategoryKey[] = ['performance', 'lighthouse', 'coverage', 'mobile', 'memory'];

const CATEGORY_WEIGHT: Record<SL.CategoryKey, number> = {
  seo: 3, hreflang: 1, links: 2, website: 2.5, performance: 2.5, cloudflare: 1.5, mobile: 2, memory: 1.5, lighthouse: 3, coverage: 1, security: 2,
};

const MODULE_TIMEOUT: Record<SL.CategoryKey, number> = {
  seo: 60000, hreflang: 120000, links: 240000, website: 90000, cloudflare: 120000,
  performance: 120000, mobile: 120000, memory: 300000, lighthouse: 180000, coverage: 120000, security: 120000,
};

export const DEFAULT_OPTIONS: Omit<SL.AuditOptions, 'url'> = {
  maxPages: 15, maxLinks: 150, modules: ALL_MODULES, memoryIterations: 8, device: 'iphone',
};

export async function runAudit(
  input: Partial<SL.AuditOptions> & { url: string },
  browser: SL.BrowserRunner | null,
  onProgress: (p: SL.Progress) => void = () => undefined,
  signal?: { cancelled: boolean },
): Promise<SL.Report> {
  const opts: SL.AuditOptions = { ...DEFAULT_OPTIONS, ...input, url: normalizeInputUrl(input.url) };
  const started = Date.now();
  const modules = opts.modules.filter((m) => browser || !BROWSER_MODULES.includes(m));
  const steps = modules.length + 2;
  let step = 0;
  const report = (s: string, cat?: SL.CategoryKey) => onProgress({ step: s, pct: Math.min(99, Math.round((step / steps) * 100)), category: cat });
  const guard = () => { if (signal?.cancelled) throw new Error('Audit cancelled'); };

  report('Fetching page');
  const page = await loadPage(opts.url);
  step++;
  guard();

  report('Discovering site');
  const base = await discoverSite(page.finalUrl, (s) => report(s));
  const needsCrawl = modules.includes('seo');
  const pages = needsCrawl ? await crawl(page, opts.maxPages, (s) => report(s, 'seo')) : [];
  const site: SiteInfo = { ...base, pages };
  step++;
  guard();

  const categories: SL.Report['categories'] = {};
  const run = async <D>(key: SL.CategoryKey, fn: (log: (s: string) => void) => Promise<SL.Category<D>> | SL.Category<D>) => {
    if (!modules.includes(key)) return;
    guard();
    report(`Running ${key} audit`, key);
    const limitMs = MODULE_TIMEOUT[key];
    let timer: NodeJS.Timeout | undefined;
    try {
      categories[key] = await Promise.race([
        Promise.resolve(fn((s) => report(s, key))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${limitMs / 1000}s`)), limitMs); }),
      ]);
    } catch (err) {
      categories[key] = failedCategory(key, err);
    } finally {
      clearTimeout(timer);
    }
    step++;
  };

  await run('seo', () => auditSeo(page, site));
  await run('hreflang', (log) => auditHreflang(page, site, log));
  await run('links', (log) => auditLinks(page, opts.maxLinks, log));
  await run('website', (log) => auditWebsite(page, log));
  await run('cloudflare', (log) => auditCloudflare(page, opts.cloudflareToken, log));
  await run('security', (log) => auditSecurity(page, opts.cloudflareToken, log));
  if (browser) {
    await run('performance', () => browser.performance(page.finalUrl));
    await run('lighthouse', (log) => browser.lighthouse(page.finalUrl, opts.lighthouseFormFactor ?? 'mobile', log));
    await run('coverage', () => browser.coverage(page.finalUrl));
    await run('mobile', () => browser.mobile(page.finalUrl, opts.device ?? 'iphone'));
    await run('memory', (log) => browser.memory(page.finalUrl, opts.memoryIterations, log, opts.memoryScenario));
  }

  let total = 0;
  let weighted = 0;
  for (const [k, c] of Object.entries(categories)) {
    if (c?.score == null) continue;
    const w = CATEGORY_WEIGHT[k as SL.CategoryKey];
    total += w;
    weighted += c.score * w;
  }
  report('Reading the site’s brand for the report');
  const hints = (categories.performance?.data as SL.PerformanceData | undefined)?.brandHints;
  const brand = await resolveBrand(page, hints).catch(() => undefined);
  onProgress({ step: 'Done', pct: 100 });
  const result: SL.Report = {
    version: VERSION,
    url: opts.url,
    finalUrl: page.finalUrl,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    score: total ? Math.round(weighted / total) : null,
    categories,
    meta: { status: page.res.status, title: clean(page.$('title').first().text()), server: page.headers.server || '', redirects: page.res.chain, brand },
  };
  result.testCases = generateTestCases(result);
  return result;
}
