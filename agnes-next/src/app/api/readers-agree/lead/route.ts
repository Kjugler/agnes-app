import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  normalizeIdentityUserId,
  readersAgreeLeadIdentityCookieOptions,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Access is repeatable. 5/min blocked real retries (landing + bridge + back-button).
  const rateLimit = rateLimitByIP(req, { maxRequests: 30, windowMs: 60000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/readers-agree/lead', req, {
      method: 'POST',
      body,
    });
    const response = NextResponse.json(data, { status });
    const leadUserId =
      status === 200 && data?.ok ? normalizeIdentityUserId(data.userId) : null;
    if (leadUserId) {
      const isHttps = req.nextUrl.protocol === 'https:';
      response.cookies.set(
        READERS_AGREE_LEAD_UID_COOKIE,
        leadUserId,
        readersAgreeLeadIdentityCookieOptions(isHttps),
      );
    }
    return response;
  } catch (err: unknown) {
    console.error('[readers-agree/lead] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
