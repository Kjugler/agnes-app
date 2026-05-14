import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ purchaseId: string }> }) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
  }
  const { purchaseId } = await ctx.params;
  if (!purchaseId?.trim()) {
    return NextResponse.json({ ok: false, error: 'purchaseId required' }, { status: 400 });
  }
  try {
    const { data, status } = await proxyJson(
      `/api/admin/purchases/${encodeURIComponent(purchaseId.trim())}/resend-confirmation`,
      req,
      {
        method: 'POST',
        body: {},
        headers: { 'x-admin-key': adminKey },
      }
    );
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/purchases/resend-confirmation] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
