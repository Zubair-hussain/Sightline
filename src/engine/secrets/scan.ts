/**
 * Sightline Secrets — the scanner core (MIT). Runs every detector over a piece of text and over
 * decoded copies of it (base64, URL-encoding, \uXXXX escapes, HTML entities), so a key hidden by
 * simple encoding is still found. Secrets never leave this module unmasked: findings carry a
 * masked preview and a one-way fingerprint for de-duplication.
 */
import { createHash } from 'node:crypto';
import { DETECTORS, isPlaceholder, type Detector, type Severity } from './detectors';

export type Decoding = 'base64' | 'url' | 'unicode' | 'html';
export type VerifyState = 'verified' | 'invalid' | 'unverified' | 'not-checked';

export interface SecretLocation {
  source: 'page' | 'script' | 'sourcemap' | 'exposed-file' | 'file' | 'git';
  url?: string;
  file?: string;
  line?: number;
  commit?: string;
  author?: string;
  date?: string;
}

export interface SecretFinding {
  detector: string;
  name: string;
  severity: Severity;
  /** e.g. "sk_l…9fQ2". The full value is never stored. */
  masked: string;
  /** First 16 hex characters of the SHA-256 of the secret: stable across locations, not reversible. */
  fingerprint: string;
  location: SecretLocation;
  /** Other places the same secret appears. */
  alsoAt: SecretLocation[];
  decodedFrom?: Decoding;
  verified: VerifyState;
  fix: string;
}

/** A finding still holding the raw secret, only for verification inside this process. */
export interface RawFinding extends Omit<SecretFinding, 'alsoAt' | 'verified'> { secret: string }

export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

export function mask(secret: string): string {
  // Private keys: show which kind, never any of the key material.
  if (secret.startsWith('-----BEGIN')) return `${secret.split(/\r?\n|\\n/)[0]} …`;
  const s = secret.replace(/\s+/g, ' ');
  if (s.length <= 12) return `${s.slice(0, 2)}${'•'.repeat(4)}`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Decoded variants of `text` that might hide a secret. Each is small and only kept when it differs. */
export function decodedVariants(text: string): { text: string; via: Decoding }[] {
  const out: { text: string; via: Decoding }[] = [];
  // base64 runs long enough to hold a key; decode each and keep the readable ones.
  const runs = text.match(/[A-Za-z0-9+/]{32,}={0,2}/g) ?? [];
  const decoded: string[] = [];
  for (const run of runs.slice(0, 200)) {
    if (run.length % 4 === 1) continue;
    const s = Buffer.from(run, 'base64').toString('utf8');
    if (s.length >= 16 && /^[\x20-\x7e\r\n\t]+$/.test(s)) decoded.push(s);
  }
  if (decoded.length) out.push({ text: decoded.join('\n'), via: 'base64' });
  if (/%[0-9a-f]{2}/i.test(text)) { try { const u = decodeURIComponent(text.replace(/\+/g, ' ')); if (u !== text) out.push({ text: u, via: 'url' }); } catch { /* malformed escape */ } }
  if (/\\u[0-9a-f]{4}/i.test(text)) out.push({ text: text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), via: 'unicode' });
  if (/&(#\d+|#x[0-9a-f]+|quot|amp|apos|lt|gt);/i.test(text)) {
    out.push({ text: text.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), via: 'html' });
  }
  return out;
}

function runDetector(d: Detector, text: string, lower: string, location: SecretLocation, via: Decoding | undefined, out: RawFinding[]): void {
  if (!d.keywords.some((k) => lower.includes(k))) return;
  d.pattern.lastIndex = 0;
  for (const m of text.matchAll(d.pattern)) {
    const secret = (m[d.group ?? 0] ?? '').trim();
    if (!secret) continue;
    // Documentation values (xxxx…, "example", your_key…) are not secrets. Private key bodies are exempt.
    if (d.id !== 'private-key' && isPlaceholder(secret)) continue;
    if (d.minEntropy && shannonEntropy(secret) < d.minEntropy) continue;
    if (d.accept && !d.accept(secret)) continue;
    out.push({
      detector: d.id, name: d.name, severity: d.severity, masked: mask(secret), fingerprint: fingerprint(secret), secret,
      location: via ? location : { ...location, line: location.line ?? lineOf(text, m.index ?? 0) }, decodedFrom: via, fix: d.fix,
    });
  }
}

/** All secrets in `text`. `location.line`, when given, is the line `text` starts on. */
export function scanText(text: string, location: SecretLocation, detectors: Detector[] = DETECTORS): RawFinding[] {
  const out: RawFinding[] = [];
  const offset = location.line ? location.line - 1 : 0;
  const base = { ...location, line: undefined };
  const lower = text.toLowerCase();
  for (const d of detectors) runDetector(d, text, lower, base, undefined, out);
  for (const f of out) if (f.location.line) f.location.line += offset;
  for (const v of decodedVariants(text)) {
    const before = new Set(out.map((f) => f.fingerprint));
    const found: RawFinding[] = [];
    const vl = v.text.toLowerCase();
    for (const d of detectors) runDetector(d, v.text, vl, location, v.via, found);
    out.push(...found.filter((f) => !before.has(f.fingerprint)));
  }
  // A more specific detector wins over the generic one for the same value.
  const specific = new Set(out.filter((f) => f.detector !== 'generic-secret').map((f) => f.fingerprint));
  return out.filter((f) => f.detector !== 'generic-secret' || !specific.has(f.fingerprint));
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** One finding per secret (same fingerprint), most severe first, with every other location kept. */
export function dedupe(raw: RawFinding[]): (SecretFinding & { secret: string })[] {
  const by = new Map<string, SecretFinding & { secret: string }>();
  for (const f of raw) {
    const prev = by.get(f.fingerprint);
    if (!prev) by.set(f.fingerprint, { ...f, alsoAt: [], verified: 'not-checked' });
    else if (prev.alsoAt.length < 20 && JSON.stringify(prev.location) !== JSON.stringify(f.location)) prev.alsoAt.push(f.location);
  }
  return [...by.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** Drops the raw secret before anything is reported or stored. */
export function publicFinding(f: SecretFinding & { secret?: string }): SecretFinding {
  const { secret: _secret, ...rest } = f;
  return rest;
}

export function describeLocation(l: SecretLocation): string {
  const where = l.file ?? l.url ?? '';
  const line = l.line ? `:${l.line}` : '';
  const commit = l.commit ? ` @ ${l.commit.slice(0, 8)}${l.author ? ` by ${l.author}` : ''}${l.date ? ` on ${l.date.slice(0, 10)}` : ''}` : '';
  return `${where}${line}${commit}`;
}
