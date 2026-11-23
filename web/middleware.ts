import { NextResponse, type NextRequest } from 'next/server';

const apiPaths = new Set(['/api/audit', '/api/config', '/api/report-html', '/api/testcases']);

/** API replicas expose no frontend and accept API calls only from our edge router. */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const apiOnly = process.env.SIGHTLINE_API_ONLY === '1';
  const secret = process.env.SIGHTLINE_ORIGIN_SECRET;
  if (path === '/healthz') return NextResponse.next();
  if (apiOnly && !apiPaths.has(path)) return new NextResponse('Not found', { status: 404 });
  if (path.startsWith('/api/')) {
    if (apiOnly && !secret) return NextResponse.json({ error: 'API replica is not configured' }, { status: 503 });
    if (secret && request.headers.get('x-sightline-origin-key') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/:path*'] };
