/**
 * Sightline web server: marketing/download website, the browser version of the app,
 * and an audit API. Run: node out/server/server.js   (PORT defaults to 8080)
 */
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import * as path from 'node:path';
import { promises as dns } from 'node:dns';
import * as net from 'node:net';
import { runAudit, VERSION, BROWSER_MODULES, ALL_MODULES } from '../engine';
import { renderHtmlReport } from '../engine/report-html';
import { testCasesToCsv, testCasesToMarkdown, testCasesToPlaywright } from '../engine/testcases';
import { setRequestGuard } from '../engine/util';

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8080);
/** Where installers are downloaded from, e.g. https://github.com/you/sightline/releases/latest/download */
const RELEASES = (process.env.SIGHTLINE_RELEASES_URL || '').replace(/\/$/, '');
/** Optional folder of installers to serve directly (defaults to ./dist if present). */
const DOWNLOAD_DIR = process.env.SIGHTLINE_DOWNLOAD_DIR || path.join(ROOT, 'dist');
const MAX_CONCURRENT = Number(process.env.SIGHTLINE_MAX_CONCURRENT || 3);
const RATE_PER_HOUR = Number(process.env.SIGHTLINE_RATE_PER_HOUR || 20);

export const DOWNLOADS: Record<string, { file: string; label: string }> = {
  windows: { file: 'Sightline-Setup-x64.exe', label: 'Windows 10/11 (x64)' },
  mac: { file: 'Sightline-mac-universal.dmg', label: 'macOS 11+ (Apple Silicon & Intel)' },
  linux: { file: 'Sightline-linux-x86_64.AppImage', label: 'Linux AppImage (x64)' },
  'linux-deb': { file: 'Sightline-linux-amd64.deb', label: 'Debian / Ubuntu (.deb)' },
  'linux-rpm': { file: 'Sightline-linux-x86_64.rpm', label: 'Fedora / RHEL (.rpm)' },
};

// ---------- SSRF protection ----------
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') ||
    v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

setRequestGuard(async (u) => {
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('only http(s) allowed');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('port not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error('internal hostname');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('private or reserved address');
});

// ---------- rate limiting ----------
const hits = new Map<string, number[]>();
let running = 0;
function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= RATE_PER_HOUR) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.every((t) => now - t > 3600_000)) hits.delete(k); }, 600_000).unref();

// ---------- helpers ----------
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res: http.ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': type, ...SECURITY_HEADERS, ...extra });
  res.end(body);
}
const json = (res: http.ServerResponse, status: number, data: unknown) => send(res, status, JSON.stringify(data), 'application/json');

async function serveFile(res: http.ServerResponse, file: string, cache = 'public, max-age=300') {
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': cache, ...SECURITY_HEADERS });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Not found');
  }
}

/** Resolve a request path inside a base folder, refusing traversal. */
function safeJoin(base: string, rel: string): string | null {
  const p = path.normalize(path.join(base, decodeURIComponent(rel)));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

async function readBody(req: http.IncomingMessage, limit = 2_000_000): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function clientIp(req: http.IncomingMessage): string {
  const fwd = process.env.SIGHTLINE_TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || req.socket.remoteAddress || 'unknown';
}

// The web app reuses the desktop UI; this injects the web bridge and relaxes CSP to allow same-origin API calls.
let appHtmlCache: string | null = null;
async function appHtml(): Promise<string> {
  if (appHtmlCache && !process.env.SIGHTLINE_DEV) return appHtmlCache;
  const raw = await fs.readFile(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
  appHtmlCache = raw
    .replace("connect-src 'none'", "connect-src 'self'")
    .replace("img-src 'self' data:", "img-src 'self' data: blob:")
    .replace('<script type="module" src="dist/app.js"></script>', '<script type="module" src="dist/web-bridge.js"></script>\n  <script type="module" src="dist/app.js"></script>')
    .replace('<head>', '<head>\n  <base href="/app/">');
  return appHtmlCache;
}

// ---------- API ----------
async function handleAudit(req: http.IncomingMessage, res: http.ServerResponse) {
  const ip = clientIp(req);
  if (!allowed(ip)) return json(res, 429, { error: `Rate limit: ${RATE_PER_HOUR} audits per hour. Download the desktop app for unlimited audits.` });
  if (running >= MAX_CONCURRENT) return json(res, 503, { error: 'The server is busy. Please try again in a minute.' });
  let body: { url?: string; modules?: string[] };
  try { body = JSON.parse(await readBody(req, 10_000)); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (!body.url) return json(res, 400, { error: 'url is required' });
  const modules = (Array.isArray(body.modules) ? body.modules : ALL_MODULES)
    .filter((m): m is SL.CategoryKey => ALL_MODULES.includes(m as SL.CategoryKey) && !BROWSER_MODULES.includes(m as SL.CategoryKey));

  running++;
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', ...SECURITY_HEADERS });
  const signal = { cancelled: false };
  req.on('close', () => { if (!res.writableEnded) signal.cancelled = true; });
  const write = (o: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
  try {
    const report = await runAudit(
      { url: body.url, modules: modules.length ? modules : ['seo'], maxPages: 8, maxLinks: 80 },
      null,
      (p) => write({ type: 'progress', ...p }),
      signal,
    );
    write({ type: 'report', report });
  } catch (err) {
    write({ type: 'error', error: (err as Error).message.replace(/Blocked: /, 'Blocked: ') });
  } finally {
    running--;
    res.end();
  }
}

async function handleReportHtml(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req, 8_000_000));
    // Accept either { report, theme, target } or a bare report
    const report = (body.report ?? body) as SL.Report;
    if (!report?.finalUrl || !report.categories) throw new Error('Invalid report');
    const theme = body.theme === 'sightline' ? 'sightline' : 'brand';
    const target = body.target === 'pdf' ? 'pdf' : 'html';
    send(res, 200, renderHtmlReport(report, { theme, target }), 'text/html; charset=utf-8', { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-src https: http:" });
  } catch (err) {
    json(res, 400, { error: (err as Error).message });
  }
}

async function handleTestCases(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req, 8_000_000)) as { report: SL.Report; cases: SL.TestCase[]; format: SL.TestCaseFormat };
    if (!body.report?.finalUrl || !Array.isArray(body.cases)) throw new Error('Invalid request');
    const out = body.format === 'csv' ? testCasesToCsv(body.cases) : body.format === 'playwright' ? testCasesToPlaywright(body.report) : testCasesToMarkdown(body.cases, body.report);
    send(res, 200, out, body.format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8');
  } catch (err) {
    json(res, 400, { error: (err as Error).message });
  }
}

async function handleDownload(res: http.ServerResponse, key: string) {
  const d = DOWNLOADS[key];
  if (!d) return send(res, 404, 'Unknown download');
  const local = path.join(DOWNLOAD_DIR, d.file);
  if (existsSync(local)) {
    res.setHeader('content-disposition', `attachment; filename="${d.file}"`);
    return serveFile(res, local, 'public, max-age=3600');
  }
  if (RELEASES) {
    res.writeHead(302, { location: `${RELEASES}/${d.file}`, ...SECURITY_HEADERS });
    return res.end();
  }
  send(res, 404, 'Installers have not been published yet. Set SIGHTLINE_RELEASES_URL or put builds in ./dist.');
}

// ---------- router ----------
export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const p = url.pathname;
      if (req.method === 'POST' && p === '/api/audit') return await handleAudit(req, res);
      if (req.method === 'POST' && p === '/api/report-html') return await handleReportHtml(req, res);
      if (req.method === 'POST' && p === '/api/testcases') return await handleTestCases(req, res);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

      if (p === '/api/config') {
        const available = Object.fromEntries(Object.entries(DOWNLOADS).map(([k, d]) => [k, existsSync(path.join(DOWNLOAD_DIR, d.file)) || Boolean(RELEASES)]));
        return json(res, 200, { version: VERSION, downloads: DOWNLOADS, available, ratePerHour: RATE_PER_HOUR });
      }
      if (p === '/healthz') return send(res, 200, 'ok');
      if (p.startsWith('/download/')) return await handleDownload(res, p.slice('/download/'.length));

      if (p === '/app' || p === '/app/') return send(res, 200, await appHtml(), 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
      if (p.startsWith('/app/')) {
        const f = safeJoin(path.join(ROOT, 'renderer'), p.slice('/app/'.length));
        if (!f || f.includes(`${path.sep}src${path.sep}`)) return send(res, 404, 'Not found');
        return await serveFile(res, f, 'no-cache'); // revalidate so app updates reach users immediately
      }

      // Website
      const siteDir = path.join(ROOT, 'website');
      const f = p === '/' ? path.join(siteDir, 'index.html') : safeJoin(siteDir, p.slice(1));
      if (!f) return send(res, 404, 'Not found');
      return await serveFile(res, f, f.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=86400' : 'no-cache');
    } catch (err) {
      if (!res.headersSent) send(res, 500, 'Server error');
      console.error(err);
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`Sightline web on http://localhost:${PORT}  (app: /app)`));
}
