/**
 * Sightline Secrets — the "Exposed secrets" audit for a website (MIT).
 *
 * Scans what any visitor can download: the page, its same-site JavaScript, public source maps
 * (including the original source they embed) and a short list of files that are often published
 * by mistake (.env, .git/config, .npmrc …). Only GET requests a browser could make.
 */
import { check, category, fetchUrl, sameSite } from '../util';
import type { Page } from '../page';
import { dedupe, describeLocation, publicFinding, scanText, type RawFinding, type SecretFinding } from './scan';
import { canVerify, verifySecret } from './verify';

export interface SecretsData {
  findings: SecretFinding[];
  scanned: { pages: number; scripts: number; sourceMaps: number; bytes: number };
  exposedFiles: string[];
  sourceMaps: string[];
  verification: 'off' | 'on';
}

export interface SecretsOptions {
  /** Ask providers whether found keys are live. Only when the user confirmed they own the site. */
  verify?: boolean;
  maxScripts?: number;
}

/** Files that are often published by mistake, with a test that the response really is that file. */
export const EXPOSED_FILES: { path: string; looksLike: RegExp; what: string }[] = [
  { path: '/.env', looksLike: /^\s*[A-Z][A-Z0-9_]*\s*=/m, what: 'environment file with settings and passwords' },
  { path: '/.env.local', looksLike: /^\s*[A-Z][A-Z0-9_]*\s*=/m, what: 'environment file' },
  { path: '/.env.production', looksLike: /^\s*[A-Z][A-Z0-9_]*\s*=/m, what: 'environment file' },
  { path: '/.git/config', looksLike: /^\s*\[core\]/m, what: 'Git repository (the whole source history can be downloaded)' },
  { path: '/.git/HEAD', looksLike: /^ref: refs\//, what: 'Git repository (the whole source history can be downloaded)' },
  { path: '/.npmrc', looksLike: /(_authToken|registry)\s*=/, what: 'npm configuration, often with a publish token' },
  { path: '/.aws/credentials', looksLike: /aws_access_key_id/i, what: 'AWS credentials file' },
  { path: '/docker-compose.yml', looksLike: /^services:\s*$/m, what: 'Docker Compose file, often with passwords' },
  { path: '/wp-config.php.bak', looksLike: /DB_PASSWORD/, what: 'WordPress configuration backup with the database password' },
  { path: '/.vscode/sftp.json', looksLike: /"(password|privateKeyPath|host)"\s*:/, what: 'editor upload settings with server credentials' },
];

const isHtml = (body: string) => /^\s*(<!doctype|<html|<head|<body)/i.test(body);

function scriptUrls(page: Page, max: number): string[] {
  const urls = new Set<string>();
  page.$('script[src], link[rel="modulepreload"][href], link[rel="preload"][as="script"][href]').each((_, el) => {
    const raw = page.$(el).attr('src') ?? page.$(el).attr('href');
    if (!raw) return;
    try { const u = new URL(raw, page.finalUrl).toString(); if (sameSite(u, page.finalUrl)) urls.add(u); } catch { /* bad URL */ }
  });
  return [...urls].slice(0, max);
}

export async function auditSecrets(page: Page, opts: SecretsOptions, log: (s: string) => void): Promise<SL.Category<SecretsData>> {
  const raw: RawFinding[] = [];
  const scanned = { pages: 1, scripts: 0, sourceMaps: 0, bytes: page.html.length };
  const sourceMaps: string[] = [];
  const exposedFiles: string[] = [];
  let budget = 25 * 1024 * 1024;

  log('Scanning the page for secrets');
  raw.push(...scanText(page.html, { source: 'page', url: page.finalUrl }));

  const scripts = scriptUrls(page, opts.maxScripts ?? 40);
  log(`Scanning ${scripts.length} script(s) and their source maps`);
  for (const url of scripts) {
    if (budget <= 0) break;
    const r = await fetchUrl(url, { timeout: 15000, maxBytes: 4 * 1024 * 1024 });
    if (r.status !== 200 || !r.body) continue;
    budget -= r.body.length; scanned.bytes += r.body.length; scanned.scripts++;
    raw.push(...scanText(r.body, { source: 'script', url }));

    const mapRef = r.body.match(/\/[/*]#\s*sourceMappingURL=([^\s*'"]+)/)?.[1] ?? r.headers['sourcemap'] ?? r.headers['x-sourcemap'];
    if (!mapRef || mapRef.startsWith('data:')) continue;
    let mapUrl: string;
    try { mapUrl = new URL(mapRef, url).toString(); } catch { continue; }
    if (!sameSite(mapUrl, page.finalUrl) || budget <= 0) continue;
    const m = await fetchUrl(mapUrl, { timeout: 15000, maxBytes: 8 * 1024 * 1024 });
    if (m.status !== 200 || isHtml(m.body)) continue;
    try {
      const map = JSON.parse(m.body) as { sources?: string[]; sourcesContent?: (string | null)[] };
      sourceMaps.push(mapUrl);
      scanned.sourceMaps++; budget -= m.body.length; scanned.bytes += m.body.length;
      (map.sourcesContent ?? []).forEach((src, i) => {
        if (src) raw.push(...scanText(src, { source: 'sourcemap', url: mapUrl, file: map.sources?.[i], line: 1 }));
      });
    } catch { /* not a source map */ }
  }

  log('Checking for files published by mistake');
  const origin = new URL(page.finalUrl).origin;
  await Promise.all(EXPOSED_FILES.map(async (f) => {
    const r = await fetchUrl(origin + f.path, { timeout: 10000, maxBytes: 512 * 1024, maxRedirects: 0 });
    if (r.status !== 200 || !r.body || isHtml(r.body) || !f.looksLike.test(r.body)) return;
    exposedFiles.push(`${origin}${f.path} — ${f.what}`);
    raw.push(...scanText(r.body, { source: 'exposed-file', url: origin + f.path }));
  }));

  const found = dedupe(raw);
  if (opts.verify) {
    log('Asking providers whether the keys are live');
    for (const f of found) if (canVerify(f.detector)) f.verified = await verifySecret(f.detector, f.secret);
  }
  const findings = found.map(publicFinding);

  const checks: SL.Check[] = [];
  const line = (f: SecretFinding) => `${f.name}: ${f.masked} — ${describeLocation(f.location)}${f.alsoAt.length ? ` (+${f.alsoAt.length} more place${f.alsoAt.length > 1 ? 's' : ''})` : ''}${f.decodedFrom ? ` [hidden with ${f.decodedFrom} encoding]` : ''}${f.verified === 'verified' ? ' — CONFIRMED LIVE' : f.verified === 'invalid' ? ' — no longer works' : ''}`;
  const serious = findings.filter((f) => (f.severity === 'critical' || f.severity === 'high') && f.verified !== 'invalid');
  const medium = findings.filter((f) => f.severity === 'medium' && f.verified !== 'invalid');
  const low = findings.filter((f) => f.severity === 'low' && f.verified !== 'invalid');
  const fixes = [...new Set([...serious, ...medium, ...low].map((f) => f.fix))].join(' ');

  checks.push(serious.length
    ? check('secrets.keys', 'Secret keys visible to visitors', 'fail', `${serious.length} secret key(s) can be read by anyone who opens the site. Treat them as stolen.`, { weight: 5, items: serious.map(line), fix: `Rotate every key listed first, then remove it from the code and redeploy. ${fixes}` })
    : medium.length
      ? check('secrets.keys', 'Secret keys visible to visitors', 'warn', `${medium.length} possible secret(s) found. Check each one; rotate any that are real.`, { weight: 3, items: medium.map(line), fix: fixes })
      : check('secrets.keys', 'Secret keys visible to visitors', 'pass', `No secret keys found in the page, ${scanned.scripts} script(s) or ${scanned.sourceMaps} source map(s).`, { weight: 5 }));
  if (low.length) checks.push(check('secrets.public-keys', 'Public API keys are restricted', 'warn', `${low.length} key(s) that are normally public (for example Google Maps or Firebase). Make sure each is restricted.`, { weight: 0.5, items: low.map(line), fix: [...new Set(low.map((f) => f.fix))].join(' ') }));

  checks.push(exposedFiles.length
    ? check('secrets.exposed-files', 'Private files published by mistake', 'fail', `${exposedFiles.length} file(s) that should never be public can be downloaded.`, { weight: 4, items: exposedFiles, fix: 'Delete these files from the web root (or block them in the server/CDN), then rotate every password and key they contained. For an exposed .git folder, assume the full source code and history are public.' })
    : check('secrets.exposed-files', 'Private files published by mistake', 'pass', `${EXPOSED_FILES.length} commonly leaked paths (.env, .git, .npmrc, backups …) are not public.`, { weight: 4 }));

  checks.push(sourceMaps.length
    ? check('secrets.source-maps', 'Public source maps', 'warn', `${sourceMaps.length} source map(s) are public, so anyone can read your original, unminified source code (comments included).`, { weight: 0.5, items: sourceMaps, fix: 'Stop uploading .map files to production (or restrict them, e.g. upload them to your error tracker only).' })
    : check('secrets.source-maps', 'Public source maps', 'pass', 'No public source maps were found for the page\'s scripts.', { weight: 0.5 }));

  checks.push(check('secrets.method', 'How this was checked', 'info', `Scanned ${(scanned.bytes / 1048576).toFixed(1)} MB: the page, ${scanned.scripts} same-site script(s), ${scanned.sourceMaps} source map(s) and ${EXPOSED_FILES.length} commonly leaked paths, with ${opts.verify ? 'live verification (one read-only "who am I" request per key)' : 'no live verification (keys were not tested)'}. Secrets are shown masked and are never stored in full.`, { weight: 0 }));

  return category('secrets', checks, { findings, scanned, exposedFiles, sourceMaps, verification: opts.verify ? 'on' : 'off' });
}
