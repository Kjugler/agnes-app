import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/** Public: latest or ?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/contest/daily-summary', req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[contest/daily-summary] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
