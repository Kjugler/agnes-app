// Proxies token-based eBook link (paperback fulfillment emails) to deepquill.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token?.trim()) {
    return NextResponse.json({ error: 'Token required' }, { status: 401 });
  }

  const base = API_BASE_URL.replace(/\/$/, '');
  const url = `${base}/api/ebook/download?token=${encodeURIComponent(token.trim())}`;

  const upstream = await fetch(url, { method: 'GET', cache: 'no-store' });

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
    return NextResponse.json({ error: 'empty_response' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}
