/* Browser implementation of the desktop bridge, used when the UI runs on the website (/app). */

const ALL: SL.CategoryKey[] = ['seo', 'hreflang', 'links', 'website', 'performance', 'lighthouse', 'coverage', 'cloudflare', 'security', 'secrets', 'mobile', 'memory'];
const DEFAULTS: SL.Settings = {
  language: 'auto', theme: 'system', maxPages: 8, maxLinks: 80, memoryIterations: 8, device: 'iphone', modules: ALL, cloudflareToken: '', reportTheme: 'brand',
  lighthouseFormFactor: 'mobile', memoryScenario: { mode: 'auto', steps: [], includeAuto: true }, memoryConsent: [],
  termsAccepted: '', dismissedUpdate: '',
};

const store = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable (private mode) */ }
  },
};

const listeners = new Set<(p: SL.Progress) => void>();
let controller: AbortController | null = null;

function download(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function fileBase(r: SL.Report): string {
  return `sightline-${new URL(r.finalUrl).hostname}-${r.startedAt.slice(0, 10)}`;
}

async function reportHtml(r: SL.Report, target: 'html' | 'pdf'): Promise<string> {
  const theme = store.get<Partial<SL.Settings>>('sl.settings', {}).reportTheme ?? 'brand';
  const res = await fetch('/api/report-html', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: r, theme, target }) });
  if (!res.ok) throw new Error('Could not render report');
  return res.text();
}

const bridge: SL.Bridge = {
  async startAudit(opts) {
    controller = new AbortController();
    try {
      const settings = store.get<SL.Settings>('sl.settings', DEFAULTS);
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: opts.url, modules: opts.modules ?? settings.modules }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, error: e.error };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'progress') listeners.forEach((l) => l(msg));
          else if (msg.type === 'error') return { ok: false, error: msg.error };
          else if (msg.type === 'report') {
            const report = msg.report as SL.Report;
            const id = String(Date.now());
            store.set(`sl.report.${id}`, report);
            const hist = [{ id, url: report.finalUrl, score: report.score, startedAt: report.startedAt }, ...store.get<SL.HistoryItem[]>('sl.history', [])];
            for (const old of hist.splice(20)) { try { localStorage.removeItem(`sl.report.${old.id}`); } catch { /* ignore */ } }
            store.set('sl.history', hist);
            return { ok: true, report };
          }
        }
      }
      return { ok: false, error: 'The connection closed before the audit finished.' };
    } catch (err) {
      return { ok: false, error: (err as Error).name === 'AbortError' ? 'Audit cancelled' : (err as Error).message };
    } finally {
      controller = null;
    }
  },
  async cancelAudit() { controller?.abort(); },
  onProgress(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async exportReport(report, format) {
    if (format === 'json') {
      download(`${fileBase(report)}.json`, new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    } else {
      const html = await reportHtml(report, format === 'pdf' ? 'pdf' : 'html');
      if (format === 'html') {
        download(`${fileBase(report)}.html`, new Blob([html], { type: 'text/html' }));
      } else {
        // PDF: print the report in a hidden frame; the browser's print dialog offers "Save as PDF".
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
        frame.srcdoc = html;
        document.body.append(frame);
        await new Promise((r) => frame.addEventListener('load', r, { once: true }));
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 60000);
      }
    }
    return format;
  },
  async exportTestCases(report, cases, format) {
    const res = await fetch('/api/testcases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report, cases, format }) });
    if (!res.ok) throw new Error('Could not export test cases');
    const host = new URL(report.finalUrl).hostname;
    const name = format === 'playwright' ? 'launch.spec.ts' : `launch-test-plan-${host}.${format}`;
    download(name, new Blob([await res.text()], { type: format === 'csv' ? 'text/csv' : 'text/plain' }));
    return name;
  },
  async getSettings() { return { ...DEFAULTS, ...store.get<Partial<SL.Settings>>('sl.settings', {}) }; },
  async setSettings(s) {
    const next = { ...(await bridge.getSettings()), ...s, cloudflareToken: '' };
    store.set('sl.settings', next);
    return next;
  },
  async listHistory() { return store.get<SL.HistoryItem[]>('sl.history', []); },
  async loadHistory(id) { return store.get<SL.Report | null>(`sl.report.${id}`, null); },
  async deleteHistory(id) {
    try { localStorage.removeItem(`sl.report.${id}`); } catch { /* ignore */ }
    store.set('sl.history', store.get<SL.HistoryItem[]>('sl.history', []).filter((h) => h.id !== id));
  },
  async openExternal(url) { window.open(url, '_blank', 'noopener'); },
  // The website shows the terms at /terms before download; the web app itself has no terms gate.
  async terms() { return { version: '', markdown: '' }; },
  // CHANGELOG.md is copied next to the web app at build time.
  async changelog() { return fetch('changelog.md').then((r) => (r.ok ? r.text() : '')).catch(() => ''); },
  // The web app is always the latest version.
  async checkUpdates() {
    return { current: '', latest: null, available: false, notes: '', releasesUrl: 'https://github.com/Zubair-hussain/Sightline/releases', downloadUrl: '/#download', publishedAt: null, checkedAt: new Date().toISOString() };
  },
  async quit() { /* nothing to quit in a browser tab */ },
  async info() {
    const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({ version: '1.0.0' }));
    return { version: cfg.version, platform: 'web', electron: '', chrome: '', locale: navigator.language, web: true, downloadUrl: '/#download' };
  },
};

window.sightline = bridge;
