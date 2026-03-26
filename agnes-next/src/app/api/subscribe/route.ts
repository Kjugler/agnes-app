import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

/**
 * Proxy POST /api/subscribe to deepquill.
 * EmailModal uses this for email digest subscription (non-blocking).
 */
export async function POST(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/subscribe', req, {
      method: 'POST',
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/subscribe] proxy error', message);
    return NextResponse.json(
      { ok: false, error: 'Subscription failed' },
      { status: 500 }
    );
  }
}
