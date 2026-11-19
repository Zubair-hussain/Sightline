import { Probe, wait } from '../probe';
import { check, category, fmtBytes } from '../../engine/util';

/** Instruments timers, listeners and observers before any page script runs. */
const INSTRUMENT = `(() => {
  const s = (window.__slm = { intervals: 0, listenersAdded: 0, listenersRemoved: 0, observers: 0, sockets: 0 });
  const live = new Set();
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (...a) { const id = si.apply(this, a); live.add(id); s.intervals = live.size; return id; };
  window.clearInterval = function (id) { live.delete(id); s.intervals = live.size; return ci.call(this, id); };
  const ae = EventTarget.prototype.addEventListener, re = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...a) { s.listenersAdded++; return ae.apply(this, a); };
  EventTarget.prototype.removeEventListener = function (...a) { s.listenersRemoved++; return re.apply(this, a); };
  for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const O = window[k]; if (!O) continue;
    window[k] = class extends O { constructor(...a) { super(...a); s.observers++; } };
  }
  if (window.WebSocket) { const W = window.WebSocket; window.WebSocket = class extends W { constructor(...a) { super(...a); s.sockets++; } }; }
  window.__slDoc = Math.random();
})();`;

/** One "user session" cycle: scroll the page, resize, toggle disclosure widgets, press Escape. */
const CYCLE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const h = Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight);
  for (let i = 1; i <= 6; i++) { window.scrollTo(0, (h * i) / 6); await sleep(120); }
  window.scrollTo(0, 0); await sleep(150);
  for (let i = 0; i < 3; i++) { window.dispatchEvent(new Event('resize')); await sleep(40); }
  // Safety: never touch controls inside forms (a <button> submits its form by default)
  // or anything whose label suggests a real action.
  const risky = /buy|purchase|pay|checkout|order|delete|remove|cancel|unsubscribe|logout|log out|sign out|submit|send|confirm|book|reserve|donate|subscribe/i;
  const toggles = [...document.querySelectorAll('button[aria-expanded], [role=button][aria-expanded], summary')]
    .filter((el) => !el.closest('form') && !risky.test((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')))
    .slice(0, 4);
  for (const t of toggles) { try { t.click(); await sleep(150); t.click(); await sleep(150); } catch (e) {} }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(200);
  return toggles.length;
})()`;

const ROUTES = `(() => {
  const here = location.pathname;
  return [...new Set([...document.querySelectorAll('a[href]')]
    .map((a) => a.href)
    .filter((h) => { try { const u = new URL(h); return u.origin === location.origin && u.pathname !== here && !u.hash && !/\\.(pdf|zip|jpg|png)$/i.test(u.pathname) && !/logout|signout|delete|cart|checkout/i.test(u.pathname); } catch (e) { return false; } }))]
    .slice(0, 3);
})()`;

function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
}

function risingShare(ys: number[]): number {
  if (ys.length < 2) return 0;
  let up = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i] > ys[i - 1]) up++;
  return up / (ys.length - 1);
}

/** Runs one user-defined step inside the page. Returns null on success or a reason it could not run. */
function stepScript(step: SL.ScenarioStep): string {
  const sel = JSON.stringify(step.selector ?? '');
  const val = JSON.stringify(step.value ?? '');
  switch (step.action) {
    case 'click':
      return `(() => { const el = document.querySelector(${sel}); if (!el) return 'not found: ' + ${sel};
        if (el.tagName === 'A') { const u = new URL(el.href, location.href); if (u.origin !== location.origin) return 'skipped: link leaves the site'; el.removeAttribute('target'); }
        el.click(); return null; })()`;
    case 'navigate':
      // In-app navigation only: click a matching link, else push the route for client-side routers.
      return `(() => { const u = new URL(${val}, location.href); if (u.origin !== location.origin) return 'skipped: other website';
        const a = [...document.querySelectorAll('a[href]')].find((x) => x.href === u.href);
        if (a) { a.removeAttribute('target'); a.click(); } else { history.pushState({}, '', u.href); dispatchEvent(new PopStateEvent('popstate')); } return null; })()`;
    case 'back':
      return `(() => { history.back(); return null; })()`;
    case 'type':
      return `(() => { const el = document.querySelector(${sel}); if (!el) return 'not found: ' + ${sel};
        el.focus(); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, ${val});
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return null; })()`;
    case 'press':
      return `(() => { const t = document.activeElement || document.body; const key = ${val} || 'Escape';
        if (key === 'Enter' && t.closest && t.closest('form')) return 'skipped: Enter would submit a form';
        t.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); t.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); return null; })()`;
    case 'scroll':
      return `(() => { const v = ${val}; window.scrollTo(0, v === 'bottom' ? document.documentElement.scrollHeight : Number(v) || 0); return null; })()`;
    case 'wait':
      return `new Promise((r) => setTimeout(() => r(null), Math.min(10000, Number(${val}) || 500)))`;
  }
}

export function describeStep(s: SL.ScenarioStep): string {
  switch (s.action) {
    case 'click': return `Click ${s.selector}`;
    case 'navigate': return `Go to ${s.value} (inside the app)`;
    case 'back': return 'Go back';
    case 'type': return `Type "${s.value}" into ${s.selector} (never submitted)`;
    case 'press': return `Press ${s.value || 'Escape'}`;
    case 'scroll': return `Scroll to ${s.value || 'top'}`;
    case 'wait': return `Wait ${s.value || 500} ms`;
  }
}

export async function auditMemory(url: string, iterations: number, log: (s: string) => void, scenario?: SL.MemoryScenario): Promise<SL.Category<SL.MemoryData>> {
  const custom = scenario?.mode === 'custom' ? scenario.steps.filter((s) => s.action) : [];
  const useAuto = custom.length === 0 || Boolean(scenario?.includeAuto);
  const stepProblems = new Map<string, number>();
  let reloads = 0;
  const runCustom = async () => {
    for (const st of custom) {
      const r = await probe.evaluate<string | null>(stepScript(st)).catch((e: Error) => `error: ${e.message.split('\n')[0]}`);
      if (r) stepProblems.set(`${describeStep(st)} → ${r}`, (stepProblems.get(`${describeStep(st)} → ${r}`) ?? 0) + 1);
      await wait(st.action === 'wait' ? 50 : 400);
    }
    const alive = await probe.evaluate<number | null>('window.__slDoc ?? null').catch(() => null);
    if (alive !== docMarker) { reloads++; docMarker = alive; }
  };
  let docMarker: number | null = null;
  const probe = await Probe.create({ width: 1280, height: 860 });
  try {
    await probe.addInitScript(INSTRUMENT);
    await probe.cdp('HeapProfiler.enable');
    log('Loading page for memory profiling');
    await probe.goto(url, 45000, 3000);

    const measure = async (iteration: number): Promise<SL.MemorySample> => {
      await probe.cdp('HeapProfiler.collectGarbage');
      await wait(150);
      await probe.cdp('HeapProfiler.collectGarbage');
      const { metrics } = await probe.cdp<{ metrics: { name: string; value: number }[] }>('Performance.getMetrics');
      const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
      const inst = await probe.evaluate<{ intervals: number } | null>('window.__slm || null').catch(() => null);
      return {
        iteration,
        heapUsed: m.JSHeapUsedSize ?? 0,
        nodes: m.Nodes ?? 0,
        listeners: m.JSEventListeners ?? 0,
        documents: m.Documents ?? 0,
        intervals: inst?.intervals ?? 0,
      };
    };

    // Detect client-side routing: click an internal link and see if the document survived.
    const routes = useAuto ? await probe.evaluate<string[]>(ROUTES).catch(() => [] as string[]) : [];
    let spa = false;
    if (routes.length) {
      const docId = await probe.evaluate<number>('window.__slDoc');
      await probe.evaluate(`(() => { const a = [...document.querySelectorAll('a[href]')].find((x) => x.href === ${JSON.stringify(routes[0])}); if (a) { a.removeAttribute('target'); a.click(); } })()`).catch(() => undefined);
      await wait(1800);
      const after = await probe.evaluate<number | null>('window.__slDoc ?? null').catch(() => null);
      spa = after === docId;
      if (spa) { await probe.evaluate('history.back()').catch(() => undefined); await wait(1200); }
      else { await probe.goto(url, 45000, 2500); }
    }

    // Warm-up cycle so lazy-initialised code doesn't look like a leak.
    docMarker = await probe.evaluate<number | null>('window.__slDoc ?? null').catch(() => null);
    if (useAuto) await probe.evaluate(CYCLE).catch(() => undefined);
    if (custom.length) await runCustom();
    reloads = 0;
    stepProblems.clear();
    const samples: SL.MemorySample[] = [await measure(0)];
    log(`Baseline heap ${fmtBytes(samples[0].heapUsed)}`);

    for (let i = 1; i <= iterations; i++) {
      if (useAuto) await probe.evaluate(CYCLE).catch(() => undefined);
      if (custom.length) await runCustom();
      if (spa) {
        for (const r of routes) {
          await probe.evaluate(`(() => { const a = [...document.querySelectorAll('a[href]')].find((x) => x.href === ${JSON.stringify(r)}); if (a) { a.removeAttribute('target'); a.click(); } })()`).catch(() => undefined);
          await wait(700);
          await probe.evaluate('history.back()').catch(() => undefined);
          await wait(700);
        }
      }
      const s = await measure(i);
      samples.push(s);
      log(`Memory cycle ${i}/${iterations}: heap ${fmtBytes(s.heapUsed)}, ${s.nodes} nodes`);
    }

    let detached: number | null = null;
    try {
      await probe.cdp('DOM.enable');
      const r = await probe.cdp<{ detachedNodes: unknown[] }>('DOM.getDetachedDomNodes');
      detached = r.detachedNodes.length;
    } catch { detached = null; }
    const inst = await probe.evaluate<{ listenersAdded: number; listenersRemoved: number; observers: number; sockets: number } | null>('window.__slm || null').catch(() => null);

    // Analysis (skip the first measured sample as further warm-up)
    const series = samples.slice(1);
    const heaps = series.map((s) => s.heapUsed);
    const first = series[0] ?? samples[0];
    const last = samples[samples.length - 1];
    const heapSlope = slope(heaps);
    const growthBytes = last.heapUsed - first.heapUsed;
    const growthPct = first.heapUsed ? (growthBytes / first.heapUsed) * 100 : 0;
    const heapRising = risingShare(heaps);
    const nodeGrowth = last.nodes - first.nodes;
    const nodeRising = risingShare(series.map((s) => s.nodes));
    const listenerGrowth = last.listeners - first.listeners;
    const listenerRising = risingShare(series.map((s) => s.listeners));
    const intervalGrowth = last.intervals - samples[0].intervals;
    const docGrowth = last.documents - samples[0].documents;

    const checks: SL.Check[] = [];
    const heapLeak = heapSlope > 100 * 1024 && growthPct > 10 && heapRising >= 0.6;
    const heapSusp = heapSlope > 30 * 1024 && growthPct > 4 && heapRising >= 0.5;
    checks.push(check('mem.heap', 'JS heap trend after GC', heapLeak ? 'fail' : heapSusp ? 'warn' : 'pass',
      `${growthBytes >= 0 ? '+' : ''}${fmtBytes(Math.abs(growthBytes))} (${growthPct.toFixed(1)}%) over ${series.length} cycles · ${fmtBytes(Math.max(0, heapSlope))}/cycle · rising in ${Math.round(heapRising * 100)}% of cycles`,
      { weight: 3, fix: heapLeak || heapSusp ? 'Take two heap snapshots in DevTools → Memory between interactions and compare "Objects allocated between snapshots" to find retained objects (closures, caches, global arrays).' : '' }));

    const nodeLeak = nodeGrowth > Math.max(200, first.nodes * 0.1) && nodeRising >= 0.6;
    checks.push(check('mem.nodes', 'DOM node count', nodeLeak ? 'fail' : nodeGrowth > Math.max(50, first.nodes * 0.03) && nodeRising >= 0.5 ? 'warn' : 'pass',
      `${first.nodes} → ${last.nodes} nodes (${nodeGrowth >= 0 ? '+' : ''}${nodeGrowth})`, { weight: 2, fix: nodeLeak ? 'Elements are created on every interaction and never removed (or are kept alive by references after removal).' : '' }));

    const lisLeak = listenerGrowth > Math.max(50, first.listeners * 0.1) && listenerRising >= 0.6;
    checks.push(check('mem.listeners', 'Event listeners', lisLeak ? 'fail' : listenerGrowth > 10 && listenerRising >= 0.5 ? 'warn' : 'pass',
      `${first.listeners} → ${last.listeners} (${listenerGrowth >= 0 ? '+' : ''}${listenerGrowth})${inst ? ` · added ${inst.listenersAdded}, removed ${inst.listenersRemoved} in total` : ''}`,
      { weight: 2, fix: lisLeak ? 'Listeners are added repeatedly without removeEventListener / AbortController cleanup (common in component unmount or resize/scroll handlers).' : '' }));

    checks.push(check('mem.intervals', 'Active intervals', intervalGrowth > 2 ? 'fail' : intervalGrowth > 0 ? 'warn' : 'pass',
      `${samples[0].intervals} → ${last.intervals} live setInterval timer(s)`, { weight: 1.5, fix: intervalGrowth > 0 ? 'Intervals are started per interaction and never cleared — store the id and clearInterval on teardown.' : '' }));

    checks.push(check('mem.documents', 'Documents / iframes', docGrowth > 1 ? 'fail' : docGrowth === 1 ? 'warn' : 'pass',
      `${samples[0].documents} → ${last.documents} documents retained`, { weight: 1 }));

    if (detached != null) {
      checks.push(check('mem.detached', 'Detached DOM nodes', detached > 200 ? 'fail' : detached > 20 ? 'warn' : 'pass',
        `${detached} detached node(s) still referenced from JavaScript`, { weight: 2, fix: detached > 20 ? 'Removed elements are still referenced (event handlers, caches, closures). Null out references after removal.' : '' }));
    }

    checks.push(check('mem.size', 'Heap size', last.heapUsed < 50e6 ? 'pass' : last.heapUsed < 150e6 ? 'warn' : 'fail', `${fmtBytes(last.heapUsed)} used after GC`, { weight: 1 }));
    if (inst?.observers) checks.push(check('mem.observers', 'Observers created', 'info', `${inst.observers} Mutation/Resize/IntersectionObserver instance(s) created during the test.`));
    if (inst?.sockets) checks.push(check('mem.sockets', 'WebSockets opened', inst.sockets > 2 ? 'warn' : 'info', `${inst.sockets} WebSocket connection(s) opened.`));
    // Verdict is based on the memory signals only (scenario problems are reported separately).
    const fails = checks.filter((c) => c.id !== 'mem.size' && c.status === 'fail').length;
    const warns = checks.filter((c) => c.status === 'warn').length;
    const verdict: SL.MemoryData['verdict'] = fails ? 'leaking' : warns ? 'suspicious' : 'clean';

    // Exactly what was done to the site, in plain language
    const plan: string[] = ['Opened the page in a private, hidden browser: no cookies, no logins, no saved data.'];
    if (useAuto) {
      plan.push(`Automatic round (×${iterations}): scroll to the bottom and back, resize the window, open and close up to 4 menus/accordions (never controls inside forms or labelled buy/delete/pay…), press Escape.`);
      if (spa) plan.push(`In-app navigation detected: visited ${routes.length} internal page(s) and came back each round (logout, delete, cart and checkout links are skipped).`);
    }
    if (custom.length) plan.push(`Your steps (×${iterations}): ${custom.map(describeStep).join(' → ')}.`);
    plan.push('Forced garbage collection and measured memory after every round.', 'Blocked throughout: downloads, pop-up windows, camera/microphone/location permissions, links to other websites.');

    if (custom.length) {
      const problems = [...stepProblems.entries()].map(([k, n]) => `${k} (×${n})`);
      checks.push(problems.length
        ? check('mem.scenario', 'Your test steps', 'warn', `${problems.length} step(s) could not run as written.`, { weight: 0, items: problems, fix: 'Check the CSS selectors in Settings → Memory test. Use the browser’s Inspect → Copy selector.' })
        : check('mem.scenario', 'Your test steps', 'pass', `All ${custom.length} step(s) ran in every round.`, { weight: 0 }));
      if (reloads) checks.push(check('mem.reloads', 'Full page reloads', 'info', `A step caused ${reloads} full page load(s). Memory resets on reload, so leaks across those steps are not measured.`));
    }
    checks.push(check('mem.method', 'What the test did', 'info', `${iterations} rounds, forced GC before each sample.${useAuto && !spa ? ' No in-app navigation detected — route leaks were not exercised.' : ''}`, { items: plan }));

    return category<SL.MemoryData>('memory', checks, {
      samples, growthBytes, growthPct, slopeBytesPerIter: heapSlope, detachedNodes: detached, verdict, spaNavigation: spa,
      plan, scenarioMode: custom.length ? 'custom' : 'auto',
    });
  } finally {
    probe.close();
  }
}
