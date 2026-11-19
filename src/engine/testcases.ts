/**
 * Launch-day test case templates. Automated cases are linked to audit checks and get their
 * status from the report; manual cases describe what a person must verify before going live.
 */

interface Template {
  id: string;
  area: string;
  title: string;
  priority: SL.TestPriority;
  preconditions?: string;
  steps: string[];
  expected: string;
  /** audit check ids that prove this case; none = manual */
  checks?: string[];
  /** only include when this predicate is true for the report */
  when?: (r: SL.Report) => boolean;
}

const hasHreflang = (r: SL.Report) => (r.categories.hreflang?.checks ?? []).some((c) => c.id === 'hreflang.present' && c.status === 'pass');

const TEMPLATES: Template[] = [
  // ---- SEO ----
  { id: 'SEO-01', area: 'SEO', title: 'Homepage can be indexed by search engines', priority: 'P0', steps: ['Open the homepage', 'View source / response headers', 'Check robots meta, X-Robots-Tag and robots.txt'], expected: 'No noindex directive and not disallowed by robots.txt.', checks: ['seo.indexable', 'seo.robots-block', 'lh.seo'] },
  { id: 'SEO-02', area: 'SEO', title: 'Title and meta description are set and the right length', priority: 'P1', steps: ['Open the homepage', 'Inspect <title> and meta description'], expected: 'Title 30–60 characters, description 70–160 characters, both unique.', checks: ['seo.title', 'seo.description'] },
  { id: 'SEO-03', area: 'SEO', title: 'robots.txt and XML sitemap are published', priority: 'P1', steps: ['Open /robots.txt', 'Open the sitemap referenced in robots.txt'], expected: 'Both return 200; sitemap lists the live URLs.', checks: ['seo.robots', 'seo.sitemap'] },
  { id: 'SEO-04', area: 'SEO', title: 'Canonical URL points to the preferred page', priority: 'P1', steps: ['Inspect <link rel="canonical">'], expected: 'Exactly one canonical, pointing to the final https URL.', checks: ['seo.canonical'] },
  { id: 'SEO-05', area: 'SEO', title: 'Structured data is valid', priority: 'P2', steps: ['Run the page through Google Rich Results Test'], expected: 'JSON-LD parses with no errors.', checks: ['seo.schema'] },
  { id: 'SEO-06', area: 'SEO', title: 'Social share preview looks right', priority: 'P2', steps: ['Paste the URL into a LinkedIn / X / Facebook post composer', 'Check image, title and description'], expected: 'Correct image, title and description appear.', checks: ['seo.og'] },
  { id: 'SEO-07', area: 'SEO', title: 'Language versions link to each other (hreflang)', priority: 'P1', steps: ['Open each language version', 'Check hreflang tags and return links'], expected: 'Valid codes, x-default present, every version links back.', checks: ['hreflang.codes', 'hreflang.return', 'hreflang.self'], when: hasHreflang },

  // ---- Links ----
  { id: 'LNK-01', area: 'Links', title: 'No broken internal links', priority: 'P0', steps: ['Crawl the homepage links'], expected: 'Every internal link returns 2xx.', checks: ['links.broken-internal', 'seo.crawl-status'] },
  { id: 'LNK-02', area: 'Links', title: 'External links work', priority: 'P2', steps: ['Check outbound links'], expected: 'No 404/5xx external links.', checks: ['links.broken-external'] },
  { id: 'LNK-03', area: 'Links', title: 'Internal links do not bounce through redirects', priority: 'P2', steps: ['Check internal link targets'], expected: 'Links point directly at final URLs.', checks: ['links.redirects'] },
  { id: 'LNK-04', area: 'Links', title: 'Custom 404 page', priority: 'P1', steps: ['Open /this-page-does-not-exist-123'], expected: 'Returns HTTP 404 (not 200) with a helpful page and a way back home.' },

  // ---- Security ----
  { id: 'SEC-01', area: 'Security', title: 'Site is served over HTTPS and http:// redirects', priority: 'P0', steps: ['Open http://<domain>'], expected: 'Redirects to https:// with a single hop.', checks: ['web.https', 'web.https-redirect'] },
  { id: 'SEC-02', area: 'Security', title: 'TLS certificate is valid and not about to expire', priority: 'P0', steps: ['Click the padlock in the browser'], expected: 'Valid certificate with more than 14 days left.', checks: ['web.cert'] },
  { id: 'SEC-03', area: 'Security', title: 'No mixed content', priority: 'P0', steps: ['Open DevTools → Console on key pages'], expected: 'No http:// resources on https pages.', checks: ['web.mixed'] },
  { id: 'SEC-04', area: 'Security', title: 'Security headers are set', priority: 'P1', steps: ['Inspect response headers'], expected: 'HSTS, CSP, X-Content-Type-Options and clickjacking protection present.', checks: ['web.h.strict-transport-security', 'web.h.content-security-policy', 'web.h.x-content-type-options', 'web.h.clickjacking'] },
  { id: 'SEC-05', area: 'Security', title: 'Admin, staging and debug URLs are not public', priority: 'P0', steps: ['Try /admin, /wp-admin, /.env, /.git/config, staging subdomains'], expected: 'Protected by login or return 404/403; nothing sensitive is exposed.' },

  // ---- Performance ----
  { id: 'PRF-01', area: 'Performance', title: 'Core Web Vitals pass on mobile', priority: 'P1', steps: ['Run a mobile Lighthouse-style test'], expected: 'LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms.', checks: ['lh.m.lcp', 'lh.m.cls', 'lh.m.tbt', 'perf.lcp', 'perf.cls', 'perf.tbt'] },
  { id: 'PRF-02', area: 'Performance', title: 'Lighthouse-style Performance score is 90+', priority: 'P2', steps: ['Run the Lighthouse-style audit'], expected: 'Performance score ≥ 90.', checks: ['lh.performance'] },
  { id: 'PRF-03', area: 'Performance', title: 'Page weight and JavaScript are within budget', priority: 'P2', steps: ['Check total transfer size and JS bytes'], expected: '< 2 MB total, < 500 KB JavaScript.', checks: ['perf.weight', 'perf.js'] },
  { id: 'PRF-04', area: 'Performance', title: 'Little unused JavaScript and CSS', priority: 'P2', steps: ['Run the code coverage audit'], expected: '< 150 KB unused JS and < 60 KB unused CSS on load.', checks: ['cov.js', 'cov.css'] },
  { id: 'PRF-05', area: 'Performance', title: 'No JavaScript errors on load', priority: 'P1', steps: ['Open DevTools → Console and reload'], expected: 'No errors.', checks: ['perf.console', 'lh.best-practices'] },
  { id: 'PRF-06', area: 'Performance', title: 'No memory leaks during normal use', priority: 'P1', steps: ['Run the memory leak test'], expected: 'Heap, DOM nodes, listeners and timers stay flat across rounds.', checks: ['mem.heap', 'mem.nodes', 'mem.listeners', 'mem.intervals'] },

  // ---- Accessibility ----
  { id: 'A11Y-01', area: 'Accessibility', title: 'Automated accessibility rules pass', priority: 'P1', steps: ['Run axe-core accessibility rules'], expected: 'Accessibility score ≥ 90 and no critical/serious violations.', checks: ['lh.accessibility'] },
  { id: 'A11Y-02', area: 'Accessibility', title: 'Form fields and buttons have labels', priority: 'P1', steps: ['Inspect forms and icon buttons'], expected: 'Every field and button has an accessible name.', checks: ['web.a11y-labels', 'links.text'] },
  { id: 'A11Y-03', area: 'Accessibility', title: 'Whole site is usable with the keyboard only', priority: 'P1', steps: ['Unplug the mouse', 'Tab through header, menu, main content, forms, footer', 'Open and close menus and dialogs with Enter/Escape'], expected: 'Every control is reachable, focus is always visible, no keyboard traps.' },
  { id: 'A11Y-04', area: 'Accessibility', title: 'Screen reader smoke test', priority: 'P2', steps: ['Turn on VoiceOver (Mac/iPhone) or NVDA (Windows)', 'Navigate headings and landmarks on the homepage'], expected: 'Page title, headings, links and images are announced sensibly.' },

  // ---- Mobile ----
  { id: 'MOB-01', area: 'Mobile', title: 'Page fits the phone screen', priority: 'P0', steps: ['Open on an iPhone and an Android phone'], expected: 'No sideways scrolling; viewport meta set.', checks: ['mob.overflow', 'mob.viewport'] },
  { id: 'MOB-02', area: 'Mobile', title: 'Buttons are easy to tap', priority: 'P1', steps: ['Tap menus, buttons and links on a phone'], expected: 'Targets are at least 44×44 pt.', checks: ['mob.targets'] },
  { id: 'MOB-03', area: 'Mobile', title: 'Forms do not zoom on iPhone', priority: 'P2', steps: ['Tap a form field in iPhone Safari'], expected: 'Page does not zoom in (inputs ≥ 16px).', checks: ['mob.input-zoom'] },
  { id: 'MOB-04', area: 'Mobile', title: 'Home Screen icon and theme colour', priority: 'P2', steps: ['iPhone Safari → Share → Add to Home Screen'], expected: 'Sharp icon and correct name appear.', checks: ['mob.touch-icon', 'mob.theme'] },
  { id: 'MOB-05', area: 'Mobile', title: 'Real-device check on iPhone and Android', priority: 'P0', steps: ['Open key pages on a real iPhone (Safari) and Android phone (Chrome)', 'Complete the main user journey'], expected: 'Everything works and looks right on both.' },

  // ---- Infrastructure ----
  { id: 'INF-01', area: 'Infrastructure', title: 'CDN enforces HTTPS and HSTS', priority: 'P1', steps: ['Check Cloudflare/CDN settings'], expected: 'Always Use HTTPS on, HSTS enabled.', checks: ['cf.always-https', 'cf.hsts'], when: (r) => Boolean((r.categories.cloudflare?.data as { onCloudflare?: boolean } | undefined)?.onCloudflare) },
  { id: 'INF-02', area: 'Infrastructure', title: 'Origin server IP is not exposed', priority: 'P1', steps: ['Look up DNS records for sibling subdomains'], expected: 'No record reveals the origin IP behind the CDN.', checks: ['cf.origin-leak'], when: (r) => Boolean((r.categories.cloudflare?.data as { onCloudflare?: boolean } | undefined)?.onCloudflare) },
  { id: 'INF-03', area: 'Infrastructure', title: 'DNS is protected (DNSSEC, CAA)', priority: 'P2', steps: ['Check DS and CAA records'], expected: 'DNSSEC enabled and CAA limits certificate issuers.', checks: ['cf.dnssec', 'cf.caa'] },
  { id: 'INF-04', area: 'Infrastructure', title: 'Email authentication (SPF, DMARC)', priority: 'P2', steps: ['Check TXT records'], expected: 'SPF and DMARC published so emails are not marked as spam.', checks: ['cf.email-auth'] },
  { id: 'INF-05', area: 'Infrastructure', title: 'Backups and rollback plan', priority: 'P0', steps: ['Confirm a fresh backup exists', 'Confirm how to roll back the release and who does it'], expected: 'Backup verified and a rollback can be done in minutes.' },

  // ---- Business-critical (manual) ----
  { id: 'BIZ-01', area: 'Business', title: 'Contact and sign-up forms work end to end', priority: 'P0', preconditions: 'Use a test email address.', steps: ['Submit every form on the site', 'Check the confirmation message', 'Check the email/CRM entry arrives'], expected: 'Every submission is received; user sees a clear confirmation.' },
  { id: 'BIZ-02', area: 'Business', title: 'Checkout / payment works in test mode', priority: 'P0', preconditions: 'Payment provider in test mode with test cards.', steps: ['Add an item', 'Pay with a test card', 'Check order confirmation and email'], expected: 'Order completes, confirmation email arrives, order appears in the dashboard.' },
  { id: 'BIZ-03', area: 'Business', title: 'Analytics and cookie consent behave correctly', priority: 'P0', steps: ['Open the site in a private window', 'Decline cookies, then accept on another visit', 'Watch the analytics real-time view'], expected: 'No tracking before consent; events appear after accepting.' },
  { id: 'BIZ-04', area: 'Business', title: 'Works in all major browsers', priority: 'P1', steps: ['Open key pages in Chrome, Safari, Firefox and Edge'], expected: 'Layout and main journey work in all four.' },
  { id: 'BIZ-05', area: 'Business', title: 'Legal pages are linked', priority: 'P1', steps: ['Check footer links'], expected: 'Privacy policy, terms and cookie policy are reachable from every page.' },
];

export function generateTestCases(report: SL.Report): SL.TestCase[] {
  const all = new Map<string, SL.Check>();
  for (const c of Object.values(report.categories)) for (const ch of c?.checks ?? []) all.set(ch.id, ch);
  return TEMPLATES.filter((t) => !t.when || t.when(report)).map((t) => {
    let status: SL.TestStatus = 'not-run';
    let evidence = '';
    if (t.checks?.length) {
      const found = t.checks.map((id) => all.get(id)).filter((c): c is SL.Check => Boolean(c) && c!.status !== 'info');
      if (!found.length) {
        evidence = 'The related audit was not run — run it in the desktop app, or test manually.';
      } else if (found.some((c) => c.status === 'fail')) {
        status = 'fail';
        evidence = found.filter((c) => c.status === 'fail').map((c) => `${c.title}: ${c.detail}`).join(' | ');
      } else if (found.some((c) => c.status === 'warn')) {
        evidence = `Needs review — ${found.filter((c) => c.status === 'warn').map((c) => `${c.title}: ${c.detail}`).join(' | ')}`;
      } else {
        status = 'pass';
        evidence = found.map((c) => `${c.title}: ${c.detail}`).join(' | ');
      }
    }
    return {
      id: t.id, area: t.area, title: t.title, priority: t.priority,
      type: t.checks?.length ? 'automated' : 'manual',
      preconditions: t.preconditions ?? '', steps: t.steps, expected: t.expected,
      status, evidence: evidence.slice(0, 600), notes: '',
    };
  });
}

// ---------- exports ----------
const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function testCasesToCsv(cases: SL.TestCase[]): string {
  const head = ['ID', 'Area', 'Title', 'Priority', 'Type', 'Preconditions', 'Steps', 'Expected result', 'Status', 'Evidence', 'Notes'];
  const rows = cases.map((c) => [c.id, c.area, c.title, c.priority, c.type, c.preconditions, c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), c.expected, c.status, c.evidence, c.notes]);
  // BOM so Excel opens UTF-8 correctly
  return '﻿' + [head, ...rows].map((r) => r.map((x) => csvCell(String(x ?? ''))).join(',')).join('\r\n');
}

export function testCasesToMarkdown(cases: SL.TestCase[], report: SL.Report): string {
  const icon: Record<SL.TestStatus, string> = { pass: '✅', fail: '❌', blocked: '⛔', 'not-run': '⬜' };
  const count = (s: SL.TestStatus) => cases.filter((c) => c.status === s).length;
  const lines = [
    `# Launch-day test plan — ${new URL(report.finalUrl).hostname}`,
    '',
    `Generated by Sightline on ${new Date(report.startedAt).toLocaleString()} · ${count('pass')} passed · ${count('fail')} failed · ${count('not-run')} to do`,
    '',
  ];
  for (const area of [...new Set(cases.map((c) => c.area))]) {
    lines.push(`## ${area}`, '');
    for (const c of cases.filter((x) => x.area === area)) {
      lines.push(`### ${icon[c.status]} ${c.id} · ${c.title} \`${c.priority}\` _${c.type}_`);
      if (c.preconditions) lines.push(`**Preconditions:** ${c.preconditions}`);
      lines.push('**Steps:**', ...c.steps.map((s, i) => `${i + 1}. ${s}`), `**Expected:** ${c.expected}`);
      if (c.evidence) lines.push(`**Evidence:** ${c.evidence}`);
      if (c.notes) lines.push(`**Notes:** ${c.notes}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** A runnable Playwright test suite (TypeScript) covering the automatable launch checks. */
export function testCasesToPlaywright(report: SL.Report): string {
  const base = new URL(report.finalUrl);
  const origin = base.origin;
  const http = `http://${base.host}${base.pathname}`;
  return `/**
 * Launch-day smoke tests for ${base.hostname} — generated by Sightline.
 *
 * Setup (once):
 *   npm init playwright@latest
 *   npm i -D @axe-core/playwright
 * Run:
 *   BASE_URL=${origin} npx playwright test launch.spec.ts
 *
 * Tip: add an iPhone project in playwright.config.ts to run the mobile checks on WebKit:
 *   projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }, { name: 'iphone', use: devices['iPhone 15'] }]
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL ?? ${JSON.stringify(origin)};
const HOME = new URL(${JSON.stringify(base.pathname + base.search)}, BASE_URL).href;

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test.describe('Launch-day checks', () => {
  test('SEO-01/02 homepage loads, is indexable, has title and description', async ({ page }) => {
    const res = await page.goto(HOME);
    expect(res?.status(), 'HTTP status').toBeLessThan(400);
    expect(res?.headers()['x-robots-tag'] ?? '').not.toContain('noindex');
    await expect(page).toHaveTitle(/.{10,}/);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc?.length ?? 0, 'meta description length').toBeGreaterThanOrEqual(50);
    const robots = (await page.locator('meta[name="robots"]').getAttribute('content').catch(() => '')) ?? '';
    expect(robots).not.toContain('noindex');
  });

  test('SEO-03 robots.txt and sitemap are published', async ({ request }) => {
    const robots = await request.get(new URL('/robots.txt', BASE_URL).href);
    expect(robots.status()).toBe(200);
    const sitemapUrl = (await robots.text()).match(/^sitemap:\\s*(\\S+)/im)?.[1] ?? new URL('/sitemap.xml', BASE_URL).href;
    const sitemap = await request.get(sitemapUrl);
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toMatch(/<(urlset|sitemapindex)/);
  });

  test('SEC-01 http redirects to https', async ({ request }) => {
    const res = await request.get(${JSON.stringify(http)}, { maxRedirects: 5 });
    expect(res.url()).toMatch(/^https:/);
  });

  test('SEC-04 security headers are present', async ({ request }) => {
    const h = (await request.get(HOME)).headers();
    expect(h['strict-transport-security'], 'HSTS').toBeTruthy();
    expect(h['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
    expect(h['x-frame-options'] || /frame-ancestors/.test(h['content-security-policy'] ?? ''), 'clickjacking protection').toBeTruthy();
  });

  test('LNK-01 internal links on the homepage are not broken', async ({ page, request }) => {
    await page.goto(HOME);
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    const internal = [...new Set(hrefs.filter((h) => h.startsWith(new URL(BASE_URL).origin)).map((h) => h.split('#')[0]))].slice(0, 100);
    const broken: string[] = [];
    for (const href of internal) {
      const r = await request.get(href, { maxRedirects: 5 });
      if (r.status() >= 400) broken.push(\`\${r.status()} \${href}\`);
    }
    expect(broken, broken.join('\\n')).toEqual([]);
  });

  test('LNK-04 unknown pages return 404', async ({ request }) => {
    const res = await request.get(new URL('/sightline-404-check-' + Date.now(), BASE_URL).href);
    expect(res.status()).toBe(404);
  });

  test('PRF-05 no JavaScript errors on load', async ({ page }) => {
    const errors = await collectErrors(page);
    await page.goto(HOME, { waitUntil: 'networkidle' });
    expect(errors, errors.join('\\n')).toEqual([]);
  });

  test('A11Y-01 no critical or serious accessibility violations', async ({ page }) => {
    await page.goto(HOME);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious.map((v) => \`\${v.id}: \${v.help} (\${v.nodes.length})\`)).toEqual([]);
  });

  test('SEO images have alt attributes', async ({ page }) => {
    await page.goto(HOME);
    const missing = await page.locator('img:not([alt])').count();
    expect(missing).toBe(0);
  });

  test('MOB-01 no horizontal scrolling on a phone', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto(HOME);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctx.close();
  });

  test('MOB-03 form fields will not zoom on iPhone (font-size ≥ 16px)', async ({ page }) => {
    await page.goto(HOME);
    const small = await page.locator('input:visible, select:visible, textarea:visible')
      .evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length);
    expect(small).toBe(0);
  });
});
`;
}
