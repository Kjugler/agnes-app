import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/**
 * Contest/user admin analytics (DeepQuill SQLite). Requires fulfillment cookie + ADMIN_KEY.
 * Proxies to GET /api/admin/contest/analytics on deepquill.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
  }

  const reqUrl = new URL(req.url);
  const qs = reqUrl.search || '';

  try {
    const { data, status } = await proxyJson(`/api/admin/contest/analytics${qs}`, req, {
      method: 'GET',
      headers: { 'x-admin-key': adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/contest/analytics] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
