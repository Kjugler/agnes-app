import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/**
 * Public published Signal list — must not depend on contest identity or Signal Room access cookies.
 * Access control for the **page** lives in `/signal-room` (gate); published posts are the same for everyone.
 */
export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/signals', req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[signals] Proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
