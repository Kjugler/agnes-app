import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function POST(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/admin/moderation/approve-signal', req, { method: 'POST' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[moderation/approve-signal] Proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
