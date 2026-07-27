import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

/** Public read-only proxy: validate referral code against deepquill (canonical DB). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code?.trim()) {
    return NextResponse.json({ ok: false, valid: false, error: 'code required' }, { status: 400 });
  }

  try {
    const validateUrl = `/api/referral/validate?code=${encodeURIComponent(code.trim().toUpperCase())}`;
    const { data, status } = await proxyJson(validateUrl, req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error('[referral/validate] proxy error', err);
    return NextResponse.json({ ok: false, valid: false, error: 'Service unavailable' }, { status: 503 });
  }
}
