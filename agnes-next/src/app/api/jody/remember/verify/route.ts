import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/jody/remember/verify', req, {
      method: 'GET',
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[jody/remember/verify] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
