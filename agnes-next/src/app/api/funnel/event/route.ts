import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { redactAdvertisingClickIdsFromFunnelPayload } from '@/lib/funnelVisit';
import { getServerAdvertisingConsentSnapshot } from '@/lib/privacy/advertisingConsentServer';
import { rateLimitByIP } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const limit = rateLimitByIP(req, { maxRequests: 120, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  try {
    const body = await req.json();
    let allowAdvertisingClickIds = false;
    try {
      allowAdvertisingClickIds = (await getServerAdvertisingConsentSnapshot()).allowed;
    } catch {
      allowAdvertisingClickIds = false;
    }
    const forwarded = redactAdvertisingClickIdsFromFunnelPayload(body, allowAdvertisingClickIds);
    const { data, status } = await proxyJson('/api/funnel/event', req, {
      method: 'POST',
      body: forwarded,
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[funnel/event] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
