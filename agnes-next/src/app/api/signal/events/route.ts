import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

const DEEPQUILL_BASE = process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/signal/events', req, { method: 'GET' });
    if (status === 404) {
      console.warn('[signal/events] Deepquill returned 404. Ensure deepquill was restarted after route-order fix. Target:', `${DEEPQUILL_BASE}/api/signal/events`);
    }
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[signal/events] Proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
