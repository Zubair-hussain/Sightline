import 'server-only';
import { installPublicGuard, createRateLimiter, DOWNLOADS } from '@engine/public-guard';

// Every outgoing request made by the engine in this server is checked against private/internal addresses.
installPublicGuard();

export { DOWNLOADS };
export const RATE_PER_HOUR = Number(process.env.SIGHTLINE_RATE_PER_HOUR || 20);
export const MAX_CONCURRENT = Number(process.env.SIGHTLINE_MAX_CONCURRENT || 3);
export const RELEASES_URL = (process.env.SIGHTLINE_RELEASES_URL || 'https://github.com/Zubair-hussain/Sightline/releases/latest/download').replace(/\/$/, '');
/** Limits for the public server: kept small so an audit finishes within serverless time limits. */
export const WEB_LIMITS = { maxPages: Number(process.env.SIGHTLINE_MAX_PAGES || 6), maxLinks: Number(process.env.SIGHTLINE_MAX_LINKS || 60) };

export const allowed = createRateLimiter(RATE_PER_HOUR);

let running = 0;
export const slots = {
  take(): boolean { if (running >= MAX_CONCURRENT) return false; running++; return true; },
  release(): void { running = Math.max(0, running - 1); },
};

/** Client IP: trusted proxy headers on Vercel or when SIGHTLINE_TRUST_PROXY is set. */
export function clientIp(req: Request): string {
  const secret = process.env.SIGHTLINE_ORIGIN_SECRET;
  if (secret && req.headers.get('x-sightline-origin-key') === secret) {
    return req.headers.get('x-sightline-client-ip') || 'router';
  }
  const trust = Boolean(process.env.VERCEL || process.env.SIGHTLINE_TRUST_PROXY);
  const fwd = trust ? (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() : '';
  return fwd || req.headers.get('x-real-ip') || 'local';
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function readJson<T>(req: Request, limitBytes: number): Promise<T> {
  const text = await req.text();
  if (text.length > limitBytes) throw new Error('Request too large');
  return JSON.parse(text) as T;
}
