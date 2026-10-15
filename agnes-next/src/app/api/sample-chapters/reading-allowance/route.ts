import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';
import {
  READING_ALLOWANCE_COOKIE,
  READING_ALLOWANCE_HEADER,
  looksLikeReadingAllowanceToken,
  readingAllowanceCookieOptions,
} from '@/lib/readingAllowance';

export const runtime = 'nodejs';

function cookieToken(req: NextRequest): string {
  return req.cookies.get(READING_ALLOWANCE_COOKIE)?.value?.trim() || '';
}

async function handle(req: NextRequest) {
  const rateLimit = rateLimitByIP(req, { maxRequests: 180, windowMs: 60000, bucket: 'reading-allowance' });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const current = cookieToken(req);
  const headers: Record<string, string> = {};
  if (looksLikeReadingAllowanceToken(current)) {
    headers[READING_ALLOWANCE_HEADER] = current;
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : undefined;
    const { data, status } = await proxyJson('/api/sample-chapters/reading-allowance', req, {
      method: req.method === 'POST' ? 'POST' : 'GET',
      body,
      headers,
      omitForwardHeaders: [READING_ALLOWANCE_HEADER],
    });
    const payload =
      data && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : data;
    const allowanceToken =
      payload && typeof payload === 'object' && typeof payload.allowanceToken === 'string'
        ? payload.allowanceToken
        : '';
    if (payload && typeof payload === 'object') {
      delete payload.allowanceToken;
      delete payload.durationMs;
    }
    const response = NextResponse.json(payload, { status });
    if (
      status === 200 &&
      payload &&
      typeof payload === 'object' &&
      payload.ok === true &&
      looksLikeReadingAllowanceToken(allowanceToken)
    ) {
      response.cookies.set(
        READING_ALLOWANCE_COOKIE,
        allowanceToken.trim(),
        readingAllowanceCookieOptions(req.nextUrl.protocol === 'https:'),
      );
    }
    return response;
  } catch (err: unknown) {
    console.error('[reading-allowance] proxy error', err);
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
