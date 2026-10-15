import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  looksLikeReadersAgreeSessionToken,
  readersAgreeLeadIdentityCookieOptions,
} from '@/lib/jodyRememberIdentity';
import {
  READING_ALLOWANCE_COOKIE,
  READING_ALLOWANCE_HEADER,
  looksLikeReadingAllowanceToken,
} from '@/lib/readingAllowance';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Access is repeatable. 5/min blocked real retries (landing + bridge + back-button).
  const rateLimit = rateLimitByIP(req, { maxRequests: 30, windowMs: 60000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const allowance = req.cookies.get(READING_ALLOWANCE_COOKIE)?.value?.trim() || '';
    const headers: Record<string, string> = { 'x-readers-agree-issue-session': '1' };
    if (looksLikeReadingAllowanceToken(allowance)) {
      headers[READING_ALLOWANCE_HEADER] = allowance;
    }
    const { data, status } = await proxyJson('/api/readers-agree/lead', req, {
      method: 'POST',
      body,
      headers,
      omitForwardHeaders: ['x-readers-agree-issue-session', READING_ALLOWANCE_HEADER],
    });
    const payload =
      data && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : data;
    const sessionToken =
      payload && typeof payload === 'object' && typeof payload.sessionToken === 'string'
        ? payload.sessionToken
        : '';
    if (payload && typeof payload === 'object') {
      delete payload.sessionToken;
    }
    const response = NextResponse.json(payload, { status });
    if (status === 200 && payload && typeof payload === 'object' && payload.ok === true) {
      if (looksLikeReadersAgreeSessionToken(sessionToken)) {
        const isHttps = req.nextUrl.protocol === 'https:';
        response.cookies.set(
          READERS_AGREE_LEAD_UID_COOKIE,
          sessionToken.trim(),
          readersAgreeLeadIdentityCookieOptions(isHttps),
        );
      }
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
