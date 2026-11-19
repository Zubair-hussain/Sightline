/**
 * Code coverage — the same measurement as Chrome DevTools' Coverage tab:
 * how many bytes of each JavaScript and CSS file the page actually executed/applied.
 */
import { Probe } from '../probe';
import { check, category, fmtBytes, sameSite } from '../../engine/util';

interface ScriptInfo { url: string; length: number }
interface Range { startOffset: number; endOffset: number; count: number }

const SCROLL = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const h = Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight);
  for (let i = 1; i <= 8; i++) { window.scrollTo(0, (h * i) / 8); await sleep(150); }
  window.scrollTo(0, 0); await sleep(300);
})()`;

export async function auditCoverage(url: string): Promise<SL.Category<SL.CoverageData>> {
  const probe = await Probe.create({ width: 1350, height: 900 });
  const scripts = new Map<string, ScriptInfo>();
  const sheets = new Map<string, ScriptInfo>();
  probe.on((method, p) => {
    if (method === 'Debugger.scriptParsed' && p.url && !p.url.startsWith('chrome-extension:')) {
      scripts.set(p.scriptId, { url: p.url, length: p.length ?? Math.max(0, p.endOffset ?? 0) });
    } else if (method === 'CSS.styleSheetAdded') {
      const hd = p.header;
      sheets.set(hd.styleSheetId, { url: hd.sourceURL || (hd.isInline ? `${url} (inline <style>)` : ''), length: hd.length ?? 0 });
    }
  });
  try {
    await probe.cdp('Debugger.enable');
    await probe.cdp('Profiler.enable');
    await probe.cdp('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
    await probe.cdp('DOM.enable');
    await probe.cdp('CSS.enable');
    await probe.cdp('CSS.startRuleUsageTracking');
    await probe.goto(url, 45000, 3000);
    await probe.evaluate(SCROLL).catch(() => undefined);

    // ---- JavaScript: block coverage; inner ranges override outer ones ----
    const { result } = await probe.cdp<{ result: { scriptId: string; url: string; functions: { ranges: Range[] }[] }[] }>('Profiler.takePreciseCoverage', {}, 60000);
    const jsByUrl = new Map<string, { total: number; used: number }>();
    for (const s of result) {
      const info = scripts.get(s.scriptId);
      const len = info?.length ?? 0;
      const u = info?.url || s.url;
      if (!u || !len || len > 30 * 1024 * 1024) continue;
      const used = new Uint8Array(len);
      for (const fn of s.functions) {
        for (const r of fn.ranges) used.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(len, r.endOffset));
      }
      let usedBytes = 0;
      for (let i = 0; i < len; i++) usedBytes += used[i];
      const agg = jsByUrl.get(u) ?? { total: 0, used: 0 };
      agg.total += len;
      agg.used += usedBytes;
      jsByUrl.set(u, agg);
    }

    // ---- CSS: used rule ranges ----
    const { ruleUsage } = await probe.cdp<{ ruleUsage: { styleSheetId: string; startOffset: number; endOffset: number; used: boolean }[] }>('CSS.stopRuleUsageTracking');
    const cssUsed = new Map<string, number>();
    for (const r of ruleUsage) if (r.used) cssUsed.set(r.styleSheetId, (cssUsed.get(r.styleSheetId) ?? 0) + (r.endOffset - r.startOffset));
    const cssByUrl = new Map<string, { total: number; used: number }>();
    for (const [id, info] of sheets) {
      if (!info.url || !info.length) continue;
      const agg = cssByUrl.get(info.url) ?? { total: 0, used: 0 };
      agg.total += info.length;
      agg.used += Math.min(info.length, cssUsed.get(id) ?? 0);
      cssByUrl.set(info.url, agg);
    }

    const toFiles = (m: Map<string, { total: number; used: number }>, type: 'js' | 'css'): SL.CoverageFile[] =>
      [...m.entries()].map(([u, v]) => ({
        url: u, type, total: v.total, unused: v.total - v.used,
        pct: v.total ? Math.round(((v.total - v.used) / v.total) * 100) : 0,
        firstParty: sameSite(u.replace(/ \(inline <style>\)$/, ''), url),
      }));
    const files = [...toFiles(jsByUrl, 'js'), ...toFiles(cssByUrl, 'css')].sort((a, b) => b.unused - a.unused);
    const sum = (t: 'js' | 'css') => files.filter((f) => f.type === t).reduce((a, f) => ({ total: a.total + f.total, unused: a.unused + f.unused }), { total: 0, unused: 0 });
    const js = sum('js');
    const css = sum('css');

    const checks: SL.Check[] = [];
    const pct = (x: { total: number; unused: number }) => (x.total ? Math.round((x.unused / x.total) * 100) : 0);
    const row = (f: SL.CoverageFile) => `${fmtBytes(f.unused)} unused of ${fmtBytes(f.total)} (${f.pct}%)  ${f.firstParty ? '' : '[3rd-party] '}${f.url}`;

    checks.push(js.unused < 50 * 1024
      ? check('cov.js', 'Unused JavaScript', 'pass', `${fmtBytes(js.unused)} of ${fmtBytes(js.total)} is never executed (${pct(js)}%).`, { weight: 3 })
      : check('cov.js', 'Unused JavaScript', js.unused < 150 * 1024 ? 'warn' : 'fail',
        `${fmtBytes(js.unused)} of ${fmtBytes(js.total)} JavaScript is downloaded but never runs on this page (${pct(js)}%).`,
        { weight: 3, items: files.filter((f) => f.type === 'js' && f.unused > 10 * 1024).slice(0, 20).map(row), fix: 'Split bundles by route (dynamic import()), remove unused libraries, and load third-party widgets only when needed.' }));
    checks.push(css.unused < 20 * 1024
      ? check('cov.css', 'Unused CSS', 'pass', `${fmtBytes(css.unused)} of ${fmtBytes(css.total)} is unused (${pct(css)}%).`, { weight: 2 })
      : check('cov.css', 'Unused CSS', css.unused < 60 * 1024 ? 'warn' : 'fail',
        `${fmtBytes(css.unused)} of ${fmtBytes(css.total)} CSS does not apply to anything on this page (${pct(css)}%).`,
        { weight: 2, items: files.filter((f) => f.type === 'css' && f.unused > 5 * 1024).slice(0, 20).map(row), fix: 'Inline critical CSS, purge unused rules (PurgeCSS / Tailwind content config) and split CSS per page.' }));

    const third = files.filter((f) => f.type === 'js' && !f.firstParty);
    const thirdUnused = third.reduce((a, f) => a + f.unused, 0);
    if (third.length) {
      checks.push(check('cov.third-party', 'Third-party JavaScript waste', thirdUnused > 200 * 1024 ? 'warn' : 'pass',
        `${third.length} third-party script(s); ${fmtBytes(thirdUnused)} of their code is unused.`, { items: third.slice(0, 15).map(row) }));
    }
    const big = files.filter((f) => f.type === 'js' && f.total > 500 * 1024);
    checks.push(big.length
      ? check('cov.bundle-size', 'Large JavaScript bundles', 'warn', `${big.length} script(s) are larger than 500 KB before compression.`, { items: big.map(row), fix: 'Large bundles block the main thread while parsing; code-split them.' })
      : check('cov.bundle-size', 'Large JavaScript bundles', 'pass', 'No single script is larger than 500 KB.'));
    checks.push(check('cov.method', 'How this was measured', 'info', 'Precise block coverage from the browser engine while the page loaded and was scrolled top to bottom. Code used only after clicks or on other pages counts as unused here — check those files before deleting anything.'));

    return category<SL.CoverageData>('coverage', checks, { js, css, files: files.slice(0, 200) });
  } finally {
    probe.close();
  }
}
