import { VERSION } from '@engine/index';
import { DOWNLOADS, RATE_PER_HOUR, RELEASES_URL, json } from '@/lib/server';

export const runtime = 'nodejs';
export const revalidate = 300;

let releaseCache: { at: number; ok: boolean } | null = null;

/** Whether installers are actually published (checked against the release, cached for 5 minutes). */
async function releasePublished(): Promise<boolean> {
  if (releaseCache && Date.now() - releaseCache.at < 300_000) return releaseCache.ok;
  let ok = false;
  try {
    const r = await fetch(`${RELEASES_URL}/${DOWNLOADS.windows.file}`, { method: 'HEAD', redirect: 'manual' });
    ok = r.status >= 200 && r.status < 400;
  } catch { ok = false; }
  releaseCache = { at: Date.now(), ok };
  return ok;
}

export async function GET(): Promise<Response> {
  const ok = await releasePublished();
  const available = Object.fromEntries(Object.keys(DOWNLOADS).map((k) => [k, ok]));
  return json({ version: VERSION, downloads: DOWNLOADS, available, ratePerHour: RATE_PER_HOUR });
}
