import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/admin/signals', req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/signals] GET proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/admin/signals', req, { method: 'POST' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/signals] POST proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
