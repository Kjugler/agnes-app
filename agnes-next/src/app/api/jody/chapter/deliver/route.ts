import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rateLimit = rateLimitByIP(req, { maxRequests: 5, windowMs: 60000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/jody/chapter/deliver', req, {
      method: 'POST',
      body,
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[jody/chapter/deliver] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
