// agnes-next/src/app/api/checkout/verify-session/route.ts
// Proxy to deepquill to verify Stripe checkout session

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

function extractSessionId(req: NextRequest): string {
  // Preferred: real query string using NextRequest.nextUrl
  const sp = req.nextUrl.searchParams;

  const direct =
    sp.get('session_id') ||
    sp.get('sessionId') ||
    sp.get('session') ||
    '';

  if (direct) return direct;

  // Fallback: handle accidental colon form like /verify-session:session_id=XXX
  // or /verify-session;session_id=XXX (some proxies do odd things)
  const href = req.nextUrl.href;
  const m =
    href.match(/[:;?&]session_id=([^&]+)/) ||
    href.match(/[:;?&]sessionId=([^&]+)/);

  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  return '';
}

export async function GET(req: NextRequest) {
  console.log('[VERIFY_SESSION_PROXY] hit', { method: req.method, url: req.url });
  
  try {
    const session_id = extractSessionId(req);

    // Debug logs (keep for now)
    console.log('[VERIFY_SESSION_PROXY] href:', req.nextUrl.href);
    console.log('[VERIFY_SESSION_PROXY] search:', req.nextUrl.search);
    console.log(
      '[VERIFY_SESSION_PROXY] params:',
      Array.from(req.nextUrl.searchParams.entries())
    );
    console.log('[VERIFY_SESSION_PROXY] extracted session_id:', session_id);

    if (!session_id) {
      return NextResponse.json(
        { ok: false, error: 'session_id required' },
        { status: 400 }
      );
    }

    console.log('[verify-session] Verifying session via deepquill', { session_id });

    // IMPORTANT: forward the query string to deepquill
    // Pass path with query included so deepquill receives it
    const path = `/api/checkout/verify-session?session_id=${encodeURIComponent(session_id)}`;

    // Proxy to deepquill
    const { data, status } = await proxyJson(path, req, {
      method: 'GET',
      headers: {
        'x-internal-proxy': process.env.INTERNAL_PROXY_SECRET || 'dev-only-secret',
      },
    });

    if (status !== 200) {
      console.error('[verify-session] Deepquill proxy failed', { status, data });
      return NextResponse.json(
        { ok: false, error: data?.error || 'Failed to verify session' },
        { status: status >= 400 && status < 600 ? status : 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[verify-session] Error proxying to deepquill', {
      error: err?.message,
      stack: err?.stack,
    });

    return NextResponse.json(
      { ok: false, error: 'server_error', message: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
