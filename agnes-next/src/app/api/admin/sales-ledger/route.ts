import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/**
 * Sales ledger (Purchase + Order, DeepQuill). Same auth pattern as contest analytics.
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
    const { data, status } = await proxyJson(`/api/admin/sales-ledger${qs}`, req, {
      method: 'GET',
      headers: { 'x-admin-key': adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/sales-ledger] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
