import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
  }
  const { date } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson(`/api/admin/contest/daily-summary/${encodeURIComponent(date)}`, req, {
      method: 'PATCH',
      headers: { 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/contest/daily-summary patch] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
