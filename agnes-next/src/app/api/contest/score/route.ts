import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
    const forceSession = searchParams.get('force_session') === '1';

    // ✅ 3) Proxy behavior: match backend rules
    const cookieHeader = req.headers.get('cookie') || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    const hasPrincipal = !!userIdCookie;
    
    // ✅ If force_session=1, require session_id (mirror backend rule)
    if (forceSession && (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0)) {
      return NextResponse.json(
        { 
          error: 'force_session=1 requires session_id parameter',
          received: {
            hasPrincipal,
            hasSessionId: !!sessionId,
          },
        },
        { status: 400 }
      );
    }
    
    // ✅ Build proxied path with all query params
    const proxiedPath = new URL('/api/contest/score', 'http://localhost:5055');
    if (sessionId) {
      proxiedPath.searchParams.set('session_id', sessionId.trim());
    }
    if (forceSession) {
      proxiedPath.searchParams.set('force_session', '1');
    }
    
    console.log('[PROXY] contest/score -> deepquill', {
      url: proxiedPath.pathname + proxiedPath.search,
      sessionId: sessionId || 'none',
      forceSession,
      hasCookie: !!cookieHeader,
      hasUserIdCookie: !!userIdCookie,
      hasPrincipal,
    });

    // Proxy to deepquill (canonical DB) - principal will be resolved from cookies
    const { data, status } = await proxyJson(proxiedPath.pathname + proxiedPath.search, req, {
      method: 'GET',
    });

    // Return deepquill response verbatim
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[PROXY] contest/score error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch score',
        message: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
