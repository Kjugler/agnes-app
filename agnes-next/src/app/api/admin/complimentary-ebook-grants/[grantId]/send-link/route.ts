import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ grantId: string }> }) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
  }
  const { grantId } = await ctx.params;
  if (!grantId?.trim()) {
    return NextResponse.json({ ok: false, error: 'grantId required' }, { status: 400 });
  }
  try {
    const { data, status } = await proxyJson(
      `/api/admin/complimentary-ebook-grants/${encodeURIComponent(grantId.trim())}/send-link`,
      req,
      {
        method: 'POST',
        body: {},
        headers: { 'x-admin-key': adminKey },
      }
    );
    if (status >= 400 || data?.ok === false) {
      console.error('[admin/complimentary-ebook] send failed', {
        grantId,
        status,
        error: data?.error || null,
        deliveryStatus: data?.deliveryStatus || null,
      });
    } else {
      console.log('[admin/complimentary-ebook] send', {
        grantId,
        deliveryStatus: data?.deliveryStatus,
      });
    }
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/complimentary-ebook] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
