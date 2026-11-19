import { check, category, fetchUrl, pool, sameSite, stripHash } from './util';
import { clean, type Page } from './page';

export interface LinkRow {
  href: string;
  text: string;
  internal: boolean;
  status?: number;
  redirects?: number;
  finalUrl?: string;
  error?: string | null;
  nofollow: boolean;
}

export interface LinksData { total: number; internal: number; external: number; checked: number; rows: LinkRow[] }

const GENERIC_ANCHORS = new Set(['click here', 'here', 'read more', 'more', 'learn more', 'link', 'this', 'click', 'go']);

export async function auditLinks(page: Page, maxLinks: number, log: (s: string) => void): Promise<SL.Category<LinksData>> {
  const { $, finalUrl } = page;
  const checks: SL.Check[] = [];
  const rows = new Map<string, LinkRow>();
  const empty: string[] = [];
  const jsLinks: string[] = [];
  const noText: string[] = [];
  const generic: string[] = [];
  const unsafeBlank: string[] = [];
  const insecure: string[] = [];
  let anchors = 0;

  $('a').each((_, el) => {
    anchors++;
    const a = $(el);
    const href = (a.attr('href') ?? '').trim();
    const label = clean(a.text()) || clean(a.attr('aria-label')) || clean(a.find('img').attr('alt')) || clean(a.attr('title'));
    if (a.attr('href') === undefined) {
      // <a> without href is only a problem when it is used as a control
      if (a.attr('onclick') || a.attr('role') === 'button') empty.push(`${label || '(no text)'} (no href)`);
      return;
    }
    if (href === '#' || href === '') { empty.push(`${label || '(no text)'} → "${href}"`); return; }
    if (/^javascript:/i.test(href)) { jsLinks.push(`${label || '(no text)'} → ${href.slice(0, 60)}`); return; }
    if (/^(mailto:|tel:|sms:|#)/i.test(href)) return;
    let abs: string;
    try { abs = stripHash(new URL(href, finalUrl).href); } catch { empty.push(`${label}: invalid href ${href}`); return; }
    if (!/^https?:/i.test(abs)) return;
    if (!label) noText.push(abs);
    else if (GENERIC_ANCHORS.has(label.toLowerCase())) generic.push(`"${label}" → ${abs}`);
    const rel = (a.attr('rel') || '').toLowerCase();
    if (a.attr('target') === '_blank' && !/noopener|noreferrer/.test(rel)) unsafeBlank.push(abs);
    if (finalUrl.startsWith('https:') && abs.startsWith('http:')) insecure.push(abs);
    if (!rows.has(abs)) rows.set(abs, { href: abs, text: label, internal: sameSite(abs, finalUrl), nofollow: /nofollow|ugc|sponsored/.test(rel) });
  });

  const all = [...rows.values()];
  const internal = all.filter((r) => r.internal);
  const external = all.filter((r) => !r.internal);
  checks.push(check('links.count', 'Links discovered', 'info', `${anchors} anchors → ${all.length} unique URLs (${internal.length} internal, ${external.length} external).`));

  // Status check (internal first, then external)
  const toCheck = [...internal, ...external].slice(0, maxLinks);
  let done = 0;
  await pool(toCheck, 8, async (r) => {
    let res = await fetchUrl(r.href, { method: 'HEAD', timeout: 10000, readBody: false });
    if (res.status === 405 || res.status === 403 || res.status === 501 || res.status === 0) {
      res = await fetchUrl(r.href, { timeout: 12000, maxBytes: 64 * 1024 });
    }
    r.status = res.status;
    r.redirects = Math.max(0, res.chain.length - 1);
    r.finalUrl = res.finalUrl;
    r.error = res.error;
    done++;
    if (done % 10 === 0 || done === toCheck.length) log(`Checked ${done}/${toCheck.length} links`);
  });

  const broken = toCheck.filter((r) => r.status === 404 || r.status === 410 || (r.status! >= 500) || (r.status === 0));
  const brokenInt = broken.filter((r) => r.internal);
  const brokenExt = broken.filter((r) => !r.internal);
  const blocked = toCheck.filter((r) => r.status === 401 || r.status === 403 || r.status === 429 || r.status === 999);
  checks.push(brokenInt.length
    ? check('links.broken-internal', 'Broken internal links', 'fail', `${brokenInt.length} internal link(s) are broken.`, { weight: 3, items: brokenInt.map((r) => `${r.status || r.error}  ${r.href}`) })
    : check('links.broken-internal', 'Broken internal links', 'pass', `${toCheck.filter((r) => r.internal).length} internal links OK.`, { weight: 3 }));
  checks.push(brokenExt.length
    ? check('links.broken-external', 'Broken external links', brokenExt.length > 3 ? 'fail' : 'warn', `${brokenExt.length} external link(s) are broken.`, { weight: 2, items: brokenExt.map((r) => `${r.status || r.error}  ${r.href}`) })
    : check('links.broken-external', 'Broken external links', 'pass', `${toCheck.filter((r) => !r.internal).length} external links OK.`, { weight: 2 }));
  if (blocked.length) checks.push(check('links.blocked', 'Links that block bots', 'info', `${blocked.length} link(s) refused automated checks (401/403/429). Verify manually.`, { items: blocked.map((r) => `${r.status}  ${r.href}`) }));

  const redirected = toCheck.filter((r) => r.internal && (r.redirects ?? 0) > 0);
  checks.push(redirected.length
    ? check('links.redirects', 'Internal links without redirects', 'warn', `${redirected.length} internal link(s) go through redirects.`, { items: redirected.map((r) => `${r.href} → ${r.finalUrl}`), fix: 'Update links to point at the final URL to save a round-trip and crawl budget.' })
    : check('links.redirects', 'Internal links without redirects', 'pass', 'Internal links point at final URLs.'));
  const chains = toCheck.filter((r) => (r.redirects ?? 0) > 1);
  if (chains.length) checks.push(check('links.chains', 'Redirect chains', 'warn', `${chains.length} link(s) pass through 2+ redirects.`, { items: chains.map((r) => `${r.redirects} hops  ${r.href}`) }));

  checks.push(empty.length
    ? check('links.empty', 'Empty or placeholder hrefs', 'warn', `${empty.length} anchor(s) have no real destination (href="#" or missing).`, { items: empty.slice(0, 30), fix: 'Use <button> for actions; anchors should navigate.' })
    : check('links.empty', 'Empty or placeholder hrefs', 'pass', 'No placeholder anchors.'));
  if (jsLinks.length) checks.push(check('links.js', 'javascript: links', 'warn', `${jsLinks.length} link(s) use javascript: URLs, which crawlers can't follow.`, { items: jsLinks.slice(0, 30) }));
  checks.push(noText.length
    ? check('links.text', 'Accessible link text', 'fail', `${noText.length} link(s) have no text or aria-label.`, { weight: 1.5, items: noText.slice(0, 30) })
    : check('links.text', 'Accessible link text', 'pass', 'Every link has a name.', { weight: 1.5 }));
  if (generic.length) checks.push(check('links.generic', 'Descriptive anchor text', 'warn', `${generic.length} link(s) use generic text like "click here".`, { items: generic.slice(0, 30), weight: 0.5 }));
  checks.push(unsafeBlank.length
    ? check('links.noopener', 'target="_blank" safety', 'warn', `${unsafeBlank.length} link(s) open a new tab without rel="noopener".`, { items: unsafeBlank.slice(0, 30), weight: 0.5 })
    : check('links.noopener', 'target="_blank" safety', 'pass', 'New-tab links are safe.', { weight: 0.5 }));
  checks.push(insecure.length
    ? check('links.http', 'HTTPS links', 'warn', `${insecure.length} link(s) point to insecure http:// URLs.`, { items: [...new Set(insecure)].slice(0, 30) })
    : check('links.http', 'HTTPS links', 'pass', 'All links use HTTPS.'));
  if (all.length > maxLinks) checks.push(check('links.limit', 'Link check limit', 'info', `Checked the first ${maxLinks} of ${all.length} URLs. Raise the limit in Settings to check all.`));

  return category('links', checks, { total: all.length, internal: internal.length, external: external.length, checked: toCheck.length, rows: toCheck });
}
