import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export async function GET(req: NextRequest) {
  try {
    const reqUrl = new URL(req.url);
    const upstream = `${API_BASE_URL}/api/jody/chapter/download${reqUrl.search}`;
    const res = await fetch(upstream, { redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        return NextResponse.redirect(location, res.status);
      }
    }

    const data = await res.json().catch(() => ({ ok: false, error: 'download_failed' }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error('[jody/chapter/download] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
