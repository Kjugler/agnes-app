import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { staffSignalActingHeaders } from '@/lib/staffSignalIdentity';

export async function POST(req: NextRequest) {
  try {
    const staff = staffSignalActingHeaders(req);
    const { data, status } = await proxyJson('/api/signal/create', req, {
      method: 'POST',
      omitForwardHeaders: ['x-user-email'],
      headers: staff,
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[signal/create] Proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
