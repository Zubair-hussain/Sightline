/**
 * Lighthouse-style audit: Performance, Accessibility, Best Practices and SEO scores from one
 * throttled page load. Performance uses Lighthouse's scoring curves; accessibility uses axe-core,
 * the same rule engine Lighthouse uses. This is an independent implementation, not Google Lighthouse.
 */
import * as fs from 'node:fs/promises';
import { nativeImage } from 'electron';
import { Probe, wait } from '../probe';
import { VITALS_SCRIPT } from './performance';
import { check, category } from '../../engine/util';
import { performanceScore, speedIndex, band } from '../../engine/lighthouse-score';

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/** Lighthouse "devtools" throttling presets. */
const PROFILES = {
  mobile: { width: 412, height: 823, dpr: 1.75, latency: 562.5, down: (1.6 * 1024 * 1024 * 0.9) / 8, up: (750 * 1024 * 0.9) / 8, cpu: 4, label: 'Moto G Power · Slow 4G (562 ms RTT, 1.4 Mbps) · 4× CPU slowdown' },
  desktop: { width: 1350, height: 940, dpr: 1, latency: 40, down: (10 * 1024 * 1024) / 8, up: (10 * 1024 * 1024) / 8, cpu: 1, label: 'Desktop 1350×940 · 40 ms RTT, 10 Mbps · no CPU slowdown' },
} as const;

let axeSource: string | null = null;
async function loadAxe(): Promise<string> {
  if (!axeSource) axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  return axeSource;
}

interface AxeResult {
  version: string;
  violations: { id: string; impact: string | null; help: string; helpUrl: string; nodes: { target: string[] }[] }[];
  passes: { id: string }[];
  incomplete: { id: string }[];
}

const IMPACT_WEIGHT: Record<string, number> = { critical: 10, serious: 7, moderate: 3, minor: 1 };

/** Live-DOM checks used for Best Practices and SEO. */
const PAGE_CHECKS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const imgs = [...document.images].filter((i) => i.complete && i.naturalWidth > 0 && vis(i));
  const badRatio = imgs.filter((i) => { const r = i.getBoundingClientRect(); const a = r.width / r.height, b = i.naturalWidth / i.naturalHeight; return getComputedStyle(i).objectFit !== 'cover' && getComputedStyle(i).objectFit !== 'contain' && Math.abs(a - b) / b > 0.05; }).map((i) => i.currentSrc || i.src).slice(0, 15);
  const lowRes = imgs.filter((i) => { const r = i.getBoundingClientRect(); return i.naturalWidth < r.width * devicePixelRatio * 0.75 && r.width > 64; }).map((i) => i.currentSrc || i.src).slice(0, 15);
  const anchors = [...document.querySelectorAll('a')];
  const uncrawlable = anchors.filter((a) => { const h = a.getAttribute('href'); return h === null ? a.hasAttribute('onclick') : /^(javascript:|#$|$)/i.test(h.trim()); }).length;
  const generic = anchors.filter((a) => /^(click here|here|read more|more|learn more|link|this)$/i.test((a.textContent || '').trim())).length;
  let small = 0, total = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const el = w.currentNode.parentElement; if (!el || !w.currentNode.textContent.trim()) continue; const n = w.currentNode.textContent.trim().length; total += n; if (parseFloat(getComputedStyle(el).fontSize) < 12) small += n; }
  const meta = (n) => document.querySelector('meta[name="' + n + '"]')?.getAttribute('content') || '';
  return {
    doctype: !!document.doctype && document.doctype.name.toLowerCase() === 'html',
    charset: !!document.querySelector('meta[charset]') || /charset/i.test(document.querySelector('meta[http-equiv="Content-Type" i]')?.getAttribute('content') || ''),
    badRatio, lowRes, uncrawlable, generic,
    legiblePct: total ? Math.round((1 - small / total) * 100) : 100,
    title: !!document.title.trim(), description: !!meta('description').trim(), viewport: /width=device-width/.test(meta('viewport')),
    noindex: /noindex/i.test(meta('robots')), lang: !!document.documentElement.lang,
    canonical: document.querySelectorAll('link[rel=canonical]').length <= 1,
    imgAltMissing: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
    https: location.protocol === 'https:',
  };
})()`;

export async function auditLighthouse(url: string, formFactor: 'mobile' | 'desktop', log: (s: string) => void): Promise<SL.Category<SL.LighthouseData>> {
  const prof = PROFILES[formFactor];
  const probe = await Probe.create({
    width: prof.width, height: prof.height,
    ...(formFactor === 'mobile' ? { mobile: true, deviceScaleFactor: prof.dpr, userAgent: MOBILE_UA, platform: 'Linux armv8l' } : {}),
  });
  const consoleErrors: string[] = [];
  const issues: string[] = [];
  const frames: { t: number; data: string }[] = [];
  let mainStatus = 0;
  probe.on((method, p) => {
    if (method === 'Runtime.exceptionThrown') consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] || 'Uncaught exception');
    else if (method === 'Log.entryAdded' && p.entry.level === 'error') consoleErrors.push(String(p.entry.text).slice(0, 160));
    else if (method === 'Audits.issueAdded') issues.push(p.issue.code);
    else if (method === 'Network.responseReceived' && p.type === 'Document' && !mainStatus) mainStatus = p.response.status;
    else if (method === 'Page.screencastFrame') {
      frames.push({ t: p.metadata.timestamp * 1000, data: p.data });
      void probe.cdp('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => undefined);
    }
  });

  try {
    await probe.cdp('Audits.enable').catch(() => undefined);
    await probe.cdp('Network.setCacheDisabled', { cacheDisabled: true });
    await probe.cdp('Network.emulateNetworkConditions', { offline: false, latency: prof.latency, downloadThroughput: prof.down, uploadThroughput: prof.up });
    await probe.cdp('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
    await probe.addInitScript(VITALS_SCRIPT);
    await probe.cdp('Page.startScreencast', { format: 'jpeg', quality: 40, maxWidth: 360, maxHeight: 720, everyNthFrame: 1 }).catch(() => undefined);

    log(`Loading page with ${formFactor} throttling`);
    const navStart = Date.now();
    await probe.goto(url, 90000, 5000);
    await probe.cdp('Page.stopScreencast').catch(() => undefined);

    const m = await probe.evaluate<{ lcp: number | null; cls: number; fcp: number | null; tbt: number }>('(() => { const v = window.__slv || {}; return { lcp: v.lcp ?? null, cls: v.cls ?? 0, fcp: v.fcp ?? null, tbt: v.tbt ?? 0 }; })()')
      .catch(() => ({ lcp: null, cls: 0, fcp: null, tbt: 0 }));

    // Speed Index from screencast frames
    log('Computing Speed Index');
    let si: number | null = null;
    try {
      const hist = (b64: string) => {
        const bmp = nativeImage.createFromBuffer(Buffer.from(b64, 'base64')).toBitmap(); // BGRA
        const h = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
        for (let i = 0; i < bmp.length; i += 16) { h[0][bmp[i + 2]]++; h[1][bmp[i + 1]]++; h[2][bmp[i]]++; } // sample every 4th pixel
        return h;
      };
      const usable = frames.filter((f) => f.t >= navStart - 50).sort((a, b) => a.t - b.t);
      if (usable.length >= 2) {
        const blank = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
        const first = hist(usable[0].data);
        const px = first[0].reduce((a, b) => a + b, 0);
        blank.forEach((c) => { c[255] = px; }); // the page starts as a blank white screen
        si = speedIndex([{ t: 0, hist: blank }, ...usable.map((f) => ({ t: f.t - navStart, hist: hist(f.data) }))]);
        if (si != null && m.fcp != null) si = Math.max(si, Math.round(m.fcp));
      }
    } catch { si = null; }

    // Restore full speed before the DOM-heavy checks
    await probe.cdp('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    await probe.cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => undefined);

    log('Running accessibility rules (axe-core)');
    let axe: AxeResult | null = null;
    try {
      await probe.evaluate(`${await loadAxe()}; true`);
      axe = await probe.evaluate<AxeResult>(`axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })
        .then((r) => ({ version: axe.version, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.slice(0, 10).map((n) => ({ target: n.target })) })), passes: r.passes.map((p) => ({ id: p.id })), incomplete: r.incomplete.map((p) => ({ id: p.id })) }))`);
    } catch { axe = null; }

    const pc = await probe.evaluate<Record<string, any>>(PAGE_CHECKS).catch(() => null);

    // ---------- scores ----------
    const perf = performanceScore(formFactor, { fcp: m.fcp, si, lcp: m.lcp, tbt: m.tbt, cls: m.cls });

    let a11y: number | null = null;
    if (axe) {
      const bad = axe.violations.reduce((s, v) => s + (IMPACT_WEIGHT[v.impact ?? 'moderate'] ?? 3), 0);
      const good = axe.passes.length * 7;
      a11y = good + bad ? Math.round((good / (good + bad)) * 100) : null;
    }

    const uniqErrors = [...new Set(consoleErrors.filter(Boolean))];
    const deprecations = issues.filter((c) => /Deprecation/i.test(c)).length;
    const otherIssues = [...new Set(issues.filter((c) => !/Deprecation/i.test(c)))];
    const bp: [boolean, number, string, string][] = pc ? [
      [pc.https, 3, 'Uses HTTPS', 'Serve every page over HTTPS.'],
      [uniqErrors.length === 0, 2, 'No browser errors logged to the console', uniqErrors.slice(0, 5).join(' · ')],
      [deprecations === 0, 1, 'Avoids deprecated APIs', `${deprecations} deprecation warning(s) reported by the browser.`],
      [otherIssues.length === 0, 1, 'No issues in the browser Issues panel', otherIssues.join(', ')],
      [pc.doctype, 1, 'Has a valid <!DOCTYPE html>', 'Add <!DOCTYPE html> to avoid quirks mode.'],
      [pc.charset, 1, 'Declares a character set', 'Add <meta charset="utf-8"> early in <head>.'],
      [pc.badRatio.length === 0, 1, 'Images display with the correct aspect ratio', pc.badRatio.join(' · ')],
      [pc.lowRes.length === 0, 1, 'Images are served at an appropriate resolution', pc.lowRes.join(' · ')],
    ] : [];
    const bpScore = bp.length ? Math.round((bp.filter((x) => x[0]).reduce((s, x) => s + x[1], 0) / bp.reduce((s, x) => s + x[1], 0)) * 100) : null;

    const seo: [boolean, number, string, string][] = pc ? [
      [mainStatus >= 200 && mainStatus < 400, 3, 'Page has a successful HTTP status code', `HTTP ${mainStatus}`],
      [!pc.noindex, 3, 'Page is not blocked from indexing', 'Remove the noindex robots directive.'],
      [pc.title, 1, 'Document has a <title>', 'Add a descriptive title.'],
      [pc.description, 1, 'Document has a meta description', 'Add a meta description.'],
      [pc.viewport, 1, 'Has a mobile viewport', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'],
      [pc.uncrawlable === 0, 1, 'Links are crawlable', `${pc.uncrawlable} link(s) use javascript:, "#" or no href.`],
      [pc.generic === 0, 1, 'Links have descriptive text', `${pc.generic} link(s) say only "click here" / "read more".`],
      [pc.imgAltMissing === 0, 1, 'Images have alt attributes', `${pc.imgAltMissing} image(s) without alt.`],
      [pc.canonical, 1, 'Single canonical URL', 'Remove duplicate canonical tags.'],
      [pc.legiblePct >= 60, 1, 'Font sizes are legible', `${pc.legiblePct}% of text is 12px or larger (target ≥ 60%).`],
      [pc.lang, 1, '<html> has a lang attribute', 'Add lang, e.g. <html lang="en">.'],
    ] : [];
    const seoScore = seo.length ? Math.round((seo.filter((x) => x[0]).reduce((s, x) => s + x[1], 0) / seo.reduce((s, x) => s + x[1], 0)) * 100) : null;

    // ---------- checks ----------
    const checks: SL.Check[] = [];
    const scoreStatus = (s: number | null): SL.Status => (s == null ? 'info' : s >= 90 ? 'pass' : s >= 50 ? 'warn' : 'fail');
    const msv = (v: number | null) => (v == null ? 'not measured' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
    checks.push(check('lh.performance', 'Performance score', scoreStatus(perf.score), `${perf.score ?? '—'} / 100 (${band(perf.score)}) on ${formFactor}`, { weight: 3 }));
    checks.push(check('lh.accessibility', 'Accessibility score', scoreStatus(a11y), `${a11y ?? '—'} / 100 · ${axe?.violations.length ?? '?'} rule(s) failing, ${axe?.passes.length ?? '?'} passing`, { weight: 3 }));
    checks.push(check('lh.best-practices', 'Best Practices score', scoreStatus(bpScore), `${bpScore ?? '—'} / 100`, { weight: 2 }));
    checks.push(check('lh.seo', 'SEO score', scoreStatus(seoScore), `${seoScore ?? '—'} / 100`, { weight: 2 }));

    const metricRow = (id: string, name: string, v: string, s: number | null, fix: string) =>
      checks.push(check(`lh.m.${id}`, name, scoreStatus(s), `${v} · metric score ${s ?? '—'}`, { weight: 0, fix: scoreStatus(s) === 'pass' ? '' : fix }));
    metricRow('fcp', 'First Contentful Paint', msv(m.fcp), perf.metricScores.fcp, 'Reduce server response time and render-blocking CSS/JS.');
    metricRow('lcp', 'Largest Contentful Paint', msv(m.lcp), perf.metricScores.lcp, 'Preload and compress the hero image; avoid client-side rendering of above-the-fold content.');
    metricRow('tbt', 'Total Blocking Time', msv(m.tbt), perf.metricScores.tbt, 'Break up long tasks; defer and trim JavaScript.');
    metricRow('cls', 'Cumulative Layout Shift', m.cls.toFixed(3), perf.metricScores.cls, 'Give images, embeds and ads fixed dimensions.');
    metricRow('si', 'Speed Index', msv(si), perf.metricScores.si, 'Show meaningful content sooner: inline critical CSS, reduce render-blocking resources.');

    for (const v of (axe?.violations ?? []).sort((x, y) => (IMPACT_WEIGHT[y.impact ?? ''] ?? 0) - (IMPACT_WEIGHT[x.impact ?? ''] ?? 0)).slice(0, 25)) {
      checks.push(check(`lh.a11y.${v.id}`, `Accessibility: ${v.help}`, v.impact === 'critical' || v.impact === 'serious' ? 'fail' : 'warn',
        `${v.nodes.length}${v.nodes.length === 10 ? '+' : ''} element(s) · impact: ${v.impact ?? 'unknown'}`,
        { weight: 0, fix: `See ${v.helpUrl}`, items: v.nodes.map((n) => n.target.join(' ')) }));
    }
    for (const [ok, , title, detail] of bp) if (!ok) checks.push(check(`lh.bp.${title}`, `Best practice: ${title}`, 'warn', detail || 'Not met.', { weight: 0 }));
    for (const [ok, , title, detail] of seo) if (!ok) checks.push(check(`lh.seo.${title}`, `SEO: ${title}`, 'warn', detail || 'Not met.', { weight: 0 }));
    checks.push(check('lh.method', 'Test conditions', 'info',
      `${prof.label}. Performance uses Lighthouse's published scoring curves and weights; accessibility uses axe-core ${axe?.version ?? ''}. Independent implementation — results will be close to, but not identical with, Google Lighthouse.`));

    const cat = category<SL.LighthouseData>('lighthouse', checks, {
      formFactor,
      scores: { performance: perf.score, accessibility: a11y, bestPractices: bpScore, seo: seoScore },
      metrics: { fcp: m.fcp, lcp: m.lcp, tbt: m.tbt, cls: m.cls, si },
      metricScores: perf.metricScores,
      axe: { violations: axe?.violations.length ?? 0, passes: axe?.passes.length ?? 0, incomplete: axe?.incomplete.length ?? 0, version: axe?.version ?? '' },
      throttling: prof.label,
    });
    // Like Lighthouse, report the four category scores; the overall value is their average.
    const four = [perf.score, a11y, bpScore, seoScore].filter((x): x is number => x != null);
    cat.score = four.length ? Math.round(four.reduce((a, b) => a + b, 0) / four.length) : null;
    return cat;
  } finally {
    await wait(0);
    probe.close();
  }
}

