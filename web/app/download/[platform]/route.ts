import { DOWNLOADS, RELEASES_URL } from '@/lib/server';

export const runtime = 'nodejs';

/** /download/windows | mac | linux | linux-deb | linux-rpm → the matching installer on the latest release. */
export async function GET(_req: Request, ctx: { params: Promise<{ platform: string }> }): Promise<Response> {
  const { platform } = await ctx.params;
  const d = DOWNLOADS[platform];
  if (!d) return new Response('Unknown download', { status: 404 });
  return Response.redirect(`${RELEASES_URL}/${d.file}`, 302);
}
