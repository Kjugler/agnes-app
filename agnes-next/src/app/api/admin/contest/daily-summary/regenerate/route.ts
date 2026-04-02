import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/** Regenerate canonical daily summary (requires fulfillment cookie + server ADMIN_KEY). */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/admin/contest/daily-summary/regenerate', req, {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/contest/regenerate] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
