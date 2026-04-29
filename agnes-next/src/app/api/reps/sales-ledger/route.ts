import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { normalizeEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  const cookieEmail =
    req.cookies.get('contest_email')?.value ||
    req.cookies.get('user_email')?.value ||
    req.cookies.get('associate_email')?.value ||
    req.cookies.get('mockEmail')?.value ||
    '';
  const repEmail = normalizeEmail(cookieEmail || req.headers.get('x-user-email') || '');
  if (!repEmail) {
    return NextResponse.json({ ok: false, error: 'missing_rep_email' }, { status: 401 });
  }

  const reqUrl = new URL(req.url);
  const qs = reqUrl.search || '';

  try {
    const { data, status } = await proxyJson(`/api/reps/sales-ledger${qs}`, req, {
      method: 'GET',
      headers: { 'x-user-email': repEmail },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[reps/sales-ledger] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}

