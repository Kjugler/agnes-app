import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/reviews/list', req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[reviews/list] Proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
