import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/contest/live-stats', req, {
      method: 'GET',
    });
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[contest/live-stats] proxy error', err?.message);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch live stats' },
      { status: 500 }
    );
  }
}
