'use server';

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/associate/status', req, {
      method: 'GET',
    });

    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.ASSOCIATE_STATUS_DEBUG === '1') {
      console.error('[associate/status] proxy error', { message });
    }
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 },
    );
  }
}
