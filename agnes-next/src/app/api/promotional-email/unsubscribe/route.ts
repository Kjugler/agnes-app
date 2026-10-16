import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/promotional-email/unsubscribe', req, {
      method: 'POST',
      body,
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[promotional-email/unsubscribe] proxy error', err);
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 500 });
  }
}
