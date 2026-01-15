import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /ebook/download?session_id=...
 * 
 * Proxies eBook download requests to deepquill
 * This allows the email link to work on the public Next.js domain
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // deepquill base (local dev or prod/ngrok)
    const deepquillBase =
      process.env.DEEPQUILL_URL || 
      process.env.NEXT_PUBLIC_DEEPQUILL_URL || 
      'http://localhost:5055';

    const target = `${deepquillBase}/api/ebook/download?session_id=${encodeURIComponent(sessionId)}`;

    console.log('[ebook/download] Proxying to deepquill', {
      sessionId,
      target,
    });

    const resp = await fetch(target, { method: 'GET' });

    // Pass through status + content-type + file bytes
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buf = await resp.arrayBuffer();

    // Build response headers
    const headers: HeadersInit = {
      'content-type': contentType,
    };

    // Pass through content-disposition if set by deepquill
    const contentDisposition = resp.headers.get('content-disposition');
    if (contentDisposition) {
      headers['content-disposition'] = contentDisposition;
    }

    // Pass through cache headers
    const cacheControl = resp.headers.get('cache-control');
    if (cacheControl) {
      headers['cache-control'] = cacheControl;
    }

    return new NextResponse(buf, {
      status: resp.status,
      headers,
    });
  } catch (err: any) {
    console.error('[ebook/download] Proxy error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Failed to process download request' },
      { status: 500 }
    );
  }
}

