export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Sightline/1.0';

export const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

export const IPADOS_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

const STATUS_VALUE: Record<SL.Status, number | null> = { pass: 1, warn: 0.5, fail: 0, info: null };

interface CheckExtra { weight?: number; fix?: string; items?: string[] }

export function check(id: string, title: string, status: SL.Status, detail = '', extra: CheckExtra = {}): SL.Check {
  return { id, title, status, detail, weight: extra.weight ?? 1, fix: extra.fix ?? '', items: extra.items ?? [] };
}

export function scoreChecks(checks: SL.Check[]): number | null {
  let total = 0;
  let got = 0;
  for (const c of checks) {
    const v = STATUS_VALUE[c.status];
    if (v === null) continue;
    total += c.weight;
    got += c.weight * v;
  }
  return total === 0 ? null : Math.round((got / total) * 100);
}

export function summarize(checks: SL.Check[]): SL.Summary {
  const s: SL.Summary = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) s[c.status]++;
  return s;
}

export function category<D>(key: SL.CategoryKey, checks: SL.Check[], data: D): SL.Category<D> {
  return { key, score: scoreChecks(checks), summary: summarize(checks), checks, data };
}

export function failedCategory(key: SL.CategoryKey, err: unknown): SL.Category<Record<string, never>> {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    key, score: null, summary: { pass: 0, warn: 0, fail: 0, info: 1 }, data: {}, error: msg,
    checks: [check(`${key}.error`, 'Module could not run', 'info', msg)],
  };
}

export type Headers = Record<string, string>;

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Headers;
  body: string;
  chain: { url: string; status: number }[];
  timeMs: number;
  ttfbMs: number | null;
  bytes: number;
  error: string | null;
}

export interface FetchOptions {
  method?: 'GET' | 'HEAD';
  timeout?: number;
  maxRedirects?: number;
  readBody?: boolean;
  maxBytes?: number;
  headers?: Record<string, string>;
  userAgent?: string;
}

function headersToObject(h: globalThis.Headers): Headers {
  const o: Headers = {};
  h.forEach((v, k) => {
    const key = k.toLowerCase();
    o[key] = o[key] ? `${o[key]}, ${v}` : v;
  });
  return o;
}

/**
 * Optional guard run before every outgoing request (including each redirect hop).
 * The public web server uses it to block private/internal addresses (SSRF protection).
 */
let requestGuard: ((url: URL) => Promise<void>) | null = null;
export function setRequestGuard(fn: ((url: URL) => Promise<void>) | null): void { requestGuard = fn; }

/** Fetch with manual redirect following so the full chain can be reported. */
export async function fetchUrl(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    method = 'GET', timeout = 15000, maxRedirects = 10, readBody = true,
    maxBytes = 5 * 1024 * 1024, headers = {}, userAgent = UA,
  } = opts;
  const chain: { url: string; status: number }[] = [];
  let current = url;
  const started = Date.now();
  let ttfbMs: number | null = null;
  const fail = (error: string): FetchResult => ({
    url, finalUrl: current, status: 0, ok: false, headers: {}, body: '', chain,
    timeMs: Date.now() - started, ttfbMs, bytes: 0, error,
  });

  for (let i = 0; i <= maxRedirects; i++) {
    if (requestGuard) {
      try { await requestGuard(new URL(current)); } catch (e) { return fail(`Blocked: ${(e as Error).message}`); }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(current, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          ...headers,
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const e = err as Error & { cause?: { code?: string } };
      return fail(e.name === 'AbortError' ? `Timed out after ${timeout} ms` : e.cause?.code || e.message);
    }
    if (ttfbMs === null) ttfbMs = Date.now() - t0;
    const hdrs = headersToObject(res.headers);
    chain.push({ url: current, status: res.status });

    if (res.status >= 300 && res.status < 400 && hdrs.location) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => undefined);
      current = new URL(hdrs.location, current).href;
      continue;
    }

    let body = '';
    let bytes = 0;
    if (readBody && method !== 'HEAD' && res.body) {
      try {
        const reader = res.body.getReader();
        const chunks: Buffer[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes <= maxBytes) chunks.push(Buffer.from(value));
          else { await reader.cancel().catch(() => undefined); break; }
        }
        body = Buffer.concat(chunks).toString('utf8');
      } catch { body = ''; }
    } else {
      await res.body?.cancel().catch(() => undefined);
    }
    clearTimeout(timer);
    return {
      url, finalUrl: current, status: res.status, ok: res.status >= 200 && res.status < 300,
      headers: hdrs, body, chain, timeMs: Date.now() - started, ttfbMs, bytes, error: null,
    };
  }
  return fail('Too many redirects');
}

/** Download a small binary file (e.g. a logo) as a data: URL. Follows redirects through the request guard. */
export async function fetchDataUrl(url: string, maxBytes = 400 * 1024): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    if (requestGuard) { try { await requestGuard(new URL(current)); } catch { return null; } }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'image/*' } });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { await res.body?.cancel().catch(() => undefined); current = new URL(loc, current).href; continue; }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (res.status !== 200 || !/^image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif)$/.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Run an async function over items with limited concurrency. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch { results[i] = undefined; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function normalizeInputUrl(input: string): string {
  let s = String(input || '').trim();
  if (!s) throw new Error('Please enter a URL');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https URLs are supported');
  return u.href;
}

export function sameSite(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch { return false; }
}

export function stripHash(u: string): string {
  try { const x = new URL(u); x.hash = ''; return x.href; } catch { return u; }
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function sameUrl(a: string, b: string): boolean {
  const n = (s: string) => stripHash(s).replace(/\/$/, '');
  return n(a) === n(b);
}
