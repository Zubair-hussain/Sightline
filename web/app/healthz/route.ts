import { MAX_CONCURRENT } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok', service: 'sightline-api', maxConcurrent: MAX_CONCURRENT }, {
    headers: { 'cache-control': 'no-store' },
  });
}
