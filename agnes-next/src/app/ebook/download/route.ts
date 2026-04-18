// Proxies purchase-email / thank-you eBook link to deepquill (Stripe session–gated download).

import { NextRequest, NextResponse } from 'next/server';
import { getInternalProxySecretTrimmed } from '@/lib/internalProxySecret';

export const runtime = 'nodejs';

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export async function GET(req: NextRequest) {
  const sessionId =
    req.nextUrl.searchParams.get('session_id') || req.nextUrl.searchParams.get('sessionId');

  if (!sessionId?.trim()) {
    return NextResponse.json({ ok: false, error: 'session_id required' }, { status: 400 });
  }

  const base = API_BASE_URL.replace(/\/$/, '');
  const url = `${base}/api/ebook/download-by-session?session_id=${encodeURIComponent(sessionId.trim())}`;

  const secret = getInternalProxySecretTrimmed();
  const headers: HeadersInit = {};
  if (secret) {
    headers['x-internal-proxy'] = secret;
  }

  const upstream = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

  const out = new Headers();
  const forward = ['content-type', 'content-disposition', 'content-length', 'cache-control', 'pragma', 'expires'];
  for (const name of forward) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }

  if (upstream.status >= 400) {
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      },
    });
  }

  if (!upstream.body) {
    return NextResponse.json({ ok: false, error: 'empty_response' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}
