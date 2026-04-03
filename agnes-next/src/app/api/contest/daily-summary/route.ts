import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/** Never cache: Signal Room bulletin must reflect latest row after nightly job / manual regenerate. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Public: latest or ?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/contest/daily-summary', req, { method: 'GET' });
    return NextResponse.json(data, {
      status,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    });
  } catch (err: unknown) {
    console.error('[contest/daily-summary] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
