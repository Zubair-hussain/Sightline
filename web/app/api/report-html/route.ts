import { renderHtmlReport } from '@engine/report-html';
import { json, readJson } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { report, theme?, target? } (or a bare report) → standalone HTML report. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson<{ report?: SL.Report; theme?: string; target?: string } & Partial<SL.Report>>(req, 8_000_000);
    const report = (body.report ?? body) as SL.Report;
    if (!report?.finalUrl || !report.categories) throw new Error('Invalid report');
    const html = renderHtmlReport(report, {
      theme: body.theme === 'sightline' ? 'sightline' : 'brand',
      target: body.target === 'pdf' ? 'pdf' : 'html',
    });
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-src https: http:",
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
}
