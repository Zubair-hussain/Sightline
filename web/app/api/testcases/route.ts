import { testCasesToCsv, testCasesToMarkdown, testCasesToPlaywright } from '@engine/testcases';
import { json, readJson } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { report, cases, format: 'csv' | 'md' | 'playwright' } → file contents. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson<{ report: SL.Report; cases: SL.TestCase[]; format: SL.TestCaseFormat }>(req, 8_000_000);
    if (!body.report?.finalUrl || !Array.isArray(body.cases)) throw new Error('Invalid request');
    const out = body.format === 'csv' ? testCasesToCsv(body.cases)
      : body.format === 'playwright' ? testCasesToPlaywright(body.report)
        : testCasesToMarkdown(body.cases, body.report);
    return new Response(out, {
      headers: { 'content-type': body.format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
}
