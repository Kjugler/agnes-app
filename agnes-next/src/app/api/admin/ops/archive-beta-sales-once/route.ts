import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

/**
 * Proxies POST to DeepQuill one-time beta archive. Server injects ADMIN_KEY.
 * Requires fulfillment session cookie (same pattern as other admin proxies).
 */
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
    const { data, status } = await proxyJson('/api/admin/ops/archive-beta-sales-once', req, {
      method: 'POST',
      body: {},
      headers: { 'x-admin-key': adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/ops/archive-beta-sales-once] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
