import * as cheerio from 'cheerio';
import { check, category, fetchUrl, pool, sameUrl } from './util';
import { validateHreflang } from './iso';
import type { Page } from './page';
import type { SiteInfo } from './site';

export interface HreflangEntry {
  hreflang: string;
  href: string;
  source: 'html' | 'header' | 'sitemap';
  status?: number;
  returnTag?: boolean;
  canonicalOk?: boolean;
  htmlLang?: string;
}

export interface HreflangData { entries: HreflangEntry[]; sources: string[] }

function parseLinkHeader(h: string, base: string): { hreflang: string; href: string }[] {
  const out: { hreflang: string; href: string }[] = [];
  for (const part of h.split(/,(?=\s*<)/)) {
    const href = part.match(/<([^>]+)>/)?.[1];
    const hl = part.match(/hreflang="?([^";]+)"?/i)?.[1];
    if (href && hl && /rel="?alternate"?/i.test(part)) out.push({ hreflang: hl.trim(), href: new URL(href, base).href });
  }
  return out;
}

export async function auditHreflang(page: Page, site: SiteInfo, log: (s: string) => void): Promise<SL.Category<HreflangData>> {
  const { $, finalUrl } = page;
  const checks: SL.Check[] = [];
  const entries: HreflangEntry[] = [];
  const relative: string[] = [];

  $('link[rel="alternate" i][hreflang]').each((_, el) => {
    const hl = ($(el).attr('hreflang') || '').trim();
    const raw = ($(el).attr('href') || '').trim();
    if (!/^https?:\/\//i.test(raw)) relative.push(`${hl} → ${raw}`);
    try { entries.push({ hreflang: hl, href: new URL(raw, finalUrl).href, source: 'html' }); } catch { relative.push(`${hl} → ${raw} (unparseable)`); }
  });
  const bodyLinks = $('body link[hreflang]').length;
  if (page.headers.link) for (const e of parseLinkHeader(page.headers.link, finalUrl)) entries.push({ ...e, source: 'header' });
  for (const a of site.sitemapAlternates) if (sameUrl(a.loc, finalUrl)) entries.push({ hreflang: a.hreflang, href: a.href, source: 'sitemap' });

  const sources = [...new Set(entries.map((e) => e.source))];
  if (!entries.length) {
    checks.push(check('hreflang.present', 'Hreflang annotations', 'info',
      'No hreflang found in HTML, HTTP Link headers or the sitemap. This is fine for single-language sites.',
      { fix: 'If you serve multiple languages or regions, add <link rel="alternate" hreflang="…"> for every version, including itself.' }));
    return category('hreflang', checks, { entries, sources });
  }
  checks.push(check('hreflang.present', 'Hreflang annotations', 'pass', `${entries.length} annotation(s) via ${sources.join(', ')}.`));
  if (sources.length > 1) checks.push(check('hreflang.sources', 'Single implementation method', 'warn', `Declared in ${sources.join(' + ')}. Multiple methods can disagree.`, { fix: 'Pick one method (HTML head, HTTP header or sitemap) and keep it consistent.' }));
  if (bodyLinks) checks.push(check('hreflang.in-body', 'Hreflang in <head>', 'fail', `${bodyLinks} hreflang link(s) are inside <body>, where search engines ignore them.`, { weight: 2 }));

  // Code validity
  const invalid: string[] = [];
  for (const e of entries) {
    const v = validateHreflang(e.hreflang);
    if (!v.valid) invalid.push(`${e.hreflang}: ${v.reason}`);
  }
  checks.push(invalid.length
    ? check('hreflang.codes', 'Valid language/region codes', 'fail', `${invalid.length} invalid code(s).`, { weight: 3, items: [...new Set(invalid)] })
    : check('hreflang.codes', 'Valid language/region codes', 'pass', 'All codes are valid ISO 639-1 / ISO 3166-1.', { weight: 3 }));

  // Duplicates & conflicts (only within one source, to avoid double counting html+sitemap)
  const primary = entries.filter((e) => e.source === sources[0]);
  const byCode = new Map<string, Set<string>>();
  for (const e of primary) byCode.set(e.hreflang.toLowerCase(), (byCode.get(e.hreflang.toLowerCase()) ?? new Set()).add(e.href));
  const conflicts = [...byCode.entries()].filter(([, s]) => s.size > 1).map(([c, s]) => `${c} → ${[...s].join(' | ')}`);
  checks.push(conflicts.length
    ? check('hreflang.conflicts', 'No conflicting codes', 'fail', `${conflicts.length} code(s) point to more than one URL.`, { weight: 2, items: conflicts })
    : check('hreflang.conflicts', 'No conflicting codes', 'pass', 'Each code maps to exactly one URL.', { weight: 2 }));

  // Self reference + x-default
  const selfRef = primary.some((e) => sameUrl(e.href, finalUrl));
  checks.push(selfRef
    ? check('hreflang.self', 'Self-referencing tag', 'pass', 'The page lists itself.', { weight: 2 })
    : check('hreflang.self', 'Self-referencing tag', 'fail', 'The page does not include a hreflang for its own URL.', { weight: 2, fix: 'Every page in a hreflang cluster must reference itself.' }));
  const xd = primary.some((e) => e.hreflang.toLowerCase() === 'x-default');
  checks.push(xd
    ? check('hreflang.xdefault', 'x-default fallback', 'pass', 'x-default is declared.')
    : check('hreflang.xdefault', 'x-default fallback', 'warn', 'No x-default.', { fix: 'Add hreflang="x-default" for users whose language is not targeted.' }));

  // Region without matching language-only fallback (informational)
  const langsWithRegion = new Set(primary.map((e) => e.hreflang.split('-')).filter((p) => p.length > 1).map((p) => p[0].toLowerCase()));
  const langOnly = new Set(primary.map((e) => e.hreflang.toLowerCase()).filter((c) => !c.includes('-')));
  const noGeneric = [...langsWithRegion].filter((l) => !langOnly.has(l));
  if (noGeneric.length) checks.push(check('hreflang.generic', 'Language-only fallback', 'info', `No generic version for: ${noGeneric.join(', ')}.`, { fix: 'Optionally add e.g. hreflang="en" so English speakers outside listed regions get a match.' }));

  checks.push(relative.length
    ? check('hreflang.absolute', 'Absolute URLs', 'fail', `${relative.length} hreflang href(s) are relative.`, { items: relative, weight: 1.5 })
    : check('hreflang.absolute', 'Absolute URLs', 'pass', 'All hreflang URLs are absolute.', { weight: 1.5 }));

  // Fetch alternates: status, return tags, canonical, html lang
  const targets = [...new Map(primary.filter((e) => !sameUrl(e.href, finalUrl)).map((e) => [e.href, e])).values()].slice(0, 30);
  log(`Verifying ${targets.length} alternate URL(s) for return tags`);
  await pool(targets, 5, async (e) => {
    const r = await fetchUrl(e.href, { timeout: 12000 });
    e.status = r.status;
    if (r.status !== 200) return;
    const $$ = cheerio.load(r.body);
    const back: string[] = [];
    $$('link[rel="alternate" i][hreflang]').each((_, el) => { try { back.push(new URL($$(el).attr('href') || '', r.finalUrl).href); } catch { /* skip */ } });
    for (const b of parseLinkHeader(r.headers.link || '', r.finalUrl)) back.push(b.href);
    e.returnTag = back.some((b) => sameUrl(b, finalUrl)) ||
      site.sitemapAlternates.some((a) => sameUrl(a.loc, e.href) && sameUrl(a.href, finalUrl));
    const can = $$('link[rel="canonical" i]').attr('href');
    e.canonicalOk = !can || sameUrl(new URL(can, r.finalUrl).href, e.href);
    e.htmlLang = $$('html').attr('lang') || '';
  });
  for (const t of targets) for (const e of entries) if (e.href === t.href) Object.assign(e, { status: t.status, returnTag: t.returnTag, canonicalOk: t.canonicalOk, htmlLang: t.htmlLang });

  const bad = targets.filter((t) => t.status !== 200);
  checks.push(bad.length
    ? check('hreflang.status', 'Alternates return 200', 'fail', `${bad.length} alternate URL(s) do not return 200.`, { weight: 2, items: bad.map((t) => `${t.status || 'ERR'}  ${t.hreflang}  ${t.href}`), fix: 'Hreflang must point directly at final, indexable 200 URLs (no redirects).' })
    : check('hreflang.status', 'Alternates return 200', 'pass', `All ${targets.length} alternates respond 200.`, { weight: 2 }));
  const noReturn = targets.filter((t) => t.status === 200 && !t.returnTag);
  checks.push(noReturn.length
    ? check('hreflang.return', 'Return tags (reciprocity)', 'fail', `${noReturn.length} alternate(s) do not link back to this page.`, { weight: 3, items: noReturn.map((t) => `${t.hreflang}  ${t.href}`), fix: 'Hreflang must be bidirectional: each alternate must list this URL too.' })
    : check('hreflang.return', 'Return tags (reciprocity)', 'pass', 'Every alternate links back.', { weight: 3 }));
  const canBad = targets.filter((t) => t.status === 200 && t.canonicalOk === false);
  checks.push(canBad.length
    ? check('hreflang.canonical', 'Alternates self-canonical', 'fail', `${canBad.length} alternate(s) canonicalise elsewhere, which cancels hreflang.`, { weight: 2, items: canBad.map((t) => t.href) })
    : check('hreflang.canonical', 'Alternates self-canonical', 'pass', 'Alternate canonicals are consistent.', { weight: 2 }));
  const langMismatch = targets.filter((t) => t.htmlLang && t.hreflang !== 'x-default' && t.htmlLang.split('-')[0].toLowerCase() !== t.hreflang.split('-')[0].toLowerCase());
  if (langMismatch.length) checks.push(check('hreflang.lang-match', 'Hreflang matches page language', 'warn', `${langMismatch.length} alternate(s) declare a different <html lang>.`, { items: langMismatch.map((t) => `${t.hreflang} vs lang="${t.htmlLang}"  ${t.href}`) }));

  return category('hreflang', checks, { entries, sources });
}
