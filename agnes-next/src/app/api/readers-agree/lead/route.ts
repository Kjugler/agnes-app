import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const isLocalHost = host.includes('localhost') || host.startsWith('127.0.0.1');
  const maxRequests = isLocalHost ? 60 : 5;
  const rateLimit = rateLimitByIP(req, { maxRequests, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/readers-agree/lead', req, {
      method: 'POST',
      body,
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[readers-agree/lead] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
