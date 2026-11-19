import { Probe } from '../probe';
import { check, category, fmtBytes, sameSite } from '../../engine/util';
import { BRAND_PROBE } from '../../engine/brand';

export const VITALS_SCRIPT = `(() => {
  const s = (window.__slv = { lcp: null, cls: 0, fcp: null, tbt: 0 });
  const obs = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) {} };
  obs('largest-contentful-paint', (e) => { s.lcp = e.startTime; });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) s.cls += e.value; });
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') s.fcp = e.startTime; });
  obs('longtask', (e) => { s.tbt += Math.max(0, e.duration - 50); });
})();`;

function grade(v: number | null, good: number, poor: number): SL.Status {
  if (v == null) return 'info';
  return v <= good ? 'pass' : v <= poor ? 'warn' : 'fail';
}
const ms = (v: number | null) => (v == null ? 'not measured' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);

export async function auditPerformance(url: string): Promise<SL.Category<SL.PerformanceData>> {
  const probe = await Probe.create({ width: 1350, height: 900 });
  const requests = new Map<string, { url: string; type: string; bytes: number; status: number }>();
  const failed: string[] = [];
  const consoleErrors: string[] = [];
  probe.on((method, p) => {
    if (method === 'Network.responseReceived') {
      requests.set(p.requestId, { url: p.response.url, type: p.type || 'Other', bytes: 0, status: p.response.status });
    } else if (method === 'Network.loadingFinished') {
      const r = requests.get(p.requestId);
      if (r) r.bytes = p.encodedDataLength;
    } else if (method === 'Network.loadingFailed' && !p.canceled) {
      failed.push(`${p.errorText}  ${p.type || ''}`);
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] || p.exceptionDetails?.text || 'Uncaught exception');
    } else if (method === 'Runtime.consoleAPICalled' && p.type === 'error') {
      consoleErrors.push((p.args || []).map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    } else if (method === 'Log.entryAdded' && p.entry.level === 'error') {
      consoleErrors.push(p.entry.text.slice(0, 200));
    }
  });

  try {
    await probe.addInitScript(VITALS_SCRIPT);
    const nav = await probe.goto(url, 45000, 3500);
    // Small scroll to trigger lazy content and finalize LCP
    await probe.evaluate('window.scrollTo(0, 400); new Promise(r => setTimeout(r, 600))').catch(() => undefined);
    const m = await probe.evaluate<{ lcp: number | null; cls: number; fcp: number | null; tbt: number; ttfb: number | null; load: number | null; dcl: number | null }>(`(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      const v = window.__slv || {};
      return { lcp: v.lcp ?? null, cls: v.cls ?? 0, fcp: v.fcp ?? null, tbt: v.tbt ?? 0,
        ttfb: n.responseStart || null, load: n.loadEventEnd || null, dcl: n.domContentLoadedEventEnd || null };
    })()`).catch(() => ({ lcp: null, cls: 0, fcp: null, tbt: 0, ttfb: null, load: null, dcl: null }));
    await probe.evaluate('window.scrollTo(0, 0)').catch(() => undefined);
    const brandHints = await probe.evaluate<SL.BrandHints>(BRAND_PROBE).catch(() => undefined);
    const screenshot = await probe.screenshot(65);

    const all = [...requests.values()];
    const byType: Record<string, { count: number; bytes: number }> = {};
    for (const r of all) {
      byType[r.type] ??= { count: 0, bytes: 0 };
      byType[r.type].count++;
      byType[r.type].bytes += r.bytes;
    }
    const transferBytes = all.reduce((a, r) => a + r.bytes, 0);
    const jsBytes = byType.Script?.bytes ?? 0;
    const imgBytes = byType.Image?.bytes ?? 0;
    const thirdParty = [...new Set(all.filter((r) => /^https?:/.test(r.url) && !sameSite(r.url, url)).map((r) => new URL(r.url).hostname))];
    const errorResponses = all.filter((r) => r.status >= 400).map((r) => `${r.status}  ${r.url}`);

    const checks: SL.Check[] = [];
    if (!nav.loaded) checks.push(check('perf.load', 'Page load', 'warn', nav.error || 'Page did not finish loading.'));
    checks.push(check('perf.lcp', 'Largest Contentful Paint', grade(m.lcp, 2500, 4000), `${ms(m.lcp)} (good ≤ 2.5 s)`, { weight: 3, fix: 'Preload the hero image, serve it in AVIF/WebP, and reduce server response time.' }));
    checks.push(check('perf.fcp', 'First Contentful Paint', grade(m.fcp, 1800, 3000), `${ms(m.fcp)} (good ≤ 1.8 s)`, { weight: 2 }));
    checks.push(check('perf.cls', 'Cumulative Layout Shift', grade(m.cls, 0.1, 0.25), `${m.cls.toFixed(3)} (good ≤ 0.1)`, { weight: 2.5, fix: 'Reserve space for images, ads and embeds with width/height or aspect-ratio.' }));
    checks.push(check('perf.tbt', 'Total Blocking Time', grade(m.tbt, 200, 600), `${ms(m.tbt)} of long-task blocking (good ≤ 200 ms)`, { weight: 2.5, fix: 'Split long JavaScript tasks, defer non-critical scripts and trim third-party code.' }));
    checks.push(check('perf.ttfb', 'Time to First Byte', grade(m.ttfb, 800, 1800), ms(m.ttfb), { weight: 1.5 }));
    checks.push(check('perf.weight', 'Total page weight', transferBytes < 2e6 ? 'pass' : transferBytes < 5e6 ? 'warn' : 'fail', `${fmtBytes(transferBytes)} transferred`, { weight: 1.5 }));
    checks.push(check('perf.requests', 'Number of requests', all.length < 80 ? 'pass' : all.length < 150 ? 'warn' : 'fail', `${all.length} requests`));
    checks.push(check('perf.js', 'JavaScript size', jsBytes < 500e3 ? 'pass' : jsBytes < 1e6 ? 'warn' : 'fail', `${fmtBytes(jsBytes)} of JavaScript across ${byType.Script?.count ?? 0} files`, { weight: 1.5, fix: 'Code-split, tree-shake and remove unused libraries.' }));
    checks.push(check('perf.images', 'Image bytes', imgBytes < 1e6 ? 'pass' : imgBytes < 2.5e6 ? 'warn' : 'fail', `${fmtBytes(imgBytes)} of images`));
    checks.push(check('perf.third-party', 'Third-party origins', thirdParty.length <= 10 ? 'pass' : thirdParty.length <= 25 ? 'warn' : 'fail', `${thirdParty.length} third-party host(s)`, { items: thirdParty, weight: 0.5 }));
    const uniqErrors = [...new Set(consoleErrors.filter(Boolean))];
    checks.push(uniqErrors.length
      ? check('perf.console', 'Console errors', uniqErrors.length > 3 ? 'fail' : 'warn', `${uniqErrors.length} JavaScript error(s) during load.`, { items: uniqErrors.slice(0, 25) })
      : check('perf.console', 'Console errors', 'pass', 'No JavaScript errors during load.'));
    const failures = [...errorResponses, ...failed];
    checks.push(failures.length
      ? check('perf.failed', 'Failed requests', 'warn', `${failures.length} subresource(s) failed or returned an error.`, { items: failures.slice(0, 25) })
      : check('perf.failed', 'Failed requests', 'pass', 'All subresources loaded.'));

    return category<SL.PerformanceData>('performance', checks, {
      ttfb: m.ttfb, fcp: m.fcp, lcp: m.lcp, cls: m.cls, tbt: m.tbt, load: m.load,
      requests: all.length, transferBytes, byType, consoleErrors: uniqErrors, screenshot, brandHints,
    });
  } finally {
    probe.close();
  }
}
