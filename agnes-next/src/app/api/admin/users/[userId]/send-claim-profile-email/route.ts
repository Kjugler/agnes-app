import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
  }
  const { userId } = await ctx.params;
  if (!userId?.trim()) {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }
  try {
    const { data, status } = await proxyJson(
      `/api/admin/users/${encodeURIComponent(userId.trim())}/send-claim-profile-email`,
      req,
      {
        method: 'POST',
        body: {},
        headers: { 'x-admin-key': adminKey },
      }
    );
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/users/send-claim-profile-email] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
