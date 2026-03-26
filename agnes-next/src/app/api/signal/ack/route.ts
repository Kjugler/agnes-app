import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function POST(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/signal/ack', req, { method: 'POST' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[signal/ack] Proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
