import { runAudit, ALL_MODULES, BROWSER_MODULES } from '@engine/index';
import { allowed, clientIp, json, readJson, slots, WEB_LIMITS, RATE_PER_HOUR } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST { url, modules? } → newline-delimited JSON stream:
 *   {"type":"progress",...}  …  then {"type":"report","report":{…}}  or  {"type":"error","error":"…"}
 * Browser-engine modules are not available on the server and are filtered out.
 */
export async function POST(req: Request): Promise<Response> {
  if (!allowed(clientIp(req))) {
    return json({ error: `Rate limit: ${RATE_PER_HOUR} audits per hour. Download the desktop app for unlimited audits.` }, 429);
  }
  let body: { url?: string; modules?: string[] };
  try { body = await readJson(req, 10_000); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.url || typeof body.url !== 'string') return json({ error: 'url is required' }, 400);
  const modules = (Array.isArray(body.modules) ? body.modules : ALL_MODULES)
    .filter((m): m is SL.CategoryKey => ALL_MODULES.includes(m as SL.CategoryKey) && !BROWSER_MODULES.includes(m as SL.CategoryKey));
  if (!slots.take()) {
    return Response.json({ error: 'The server is busy. Please try again in a minute.' }, {
      status: 503,
      // The router may try another replica only before an audit has started.
      headers: { 'cache-control': 'no-store', 'retry-after': '5', 'x-sightline-retryable': '1' },
    });
  }

  const signal = { cancelled: false };
  req.signal.addEventListener('abort', () => { signal.cancelled = true; });
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* client gone */ } };
      try {
        const report = await runAudit(
          { url: body.url!, modules: modules.length ? modules : ['seo'], ...WEB_LIMITS },
          null,
          (p) => write({ type: 'progress', ...p }),
          signal,
        );
        write({ type: 'report', report });
      } catch (err) {
        write({ type: 'error', error: (err as Error).message });
      } finally {
        slots.release();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}
