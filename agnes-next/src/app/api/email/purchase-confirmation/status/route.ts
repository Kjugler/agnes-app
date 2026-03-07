/**
 * Email delivery status API route - proxies to deepquill backend
 * 
 * Returns email delivery status for purchase confirmation emails by session_id.
 * This allows the UI to show helpful messages when emails are rejected/queued/error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'missing_session_id' },
        { status: 400 }
      );
    }

    const trimmedSessionId = sessionId.trim();
    
    // [PROXY] Log proxy attempt
    console.log('[PROXY] email/purchase-confirmation/status -> deepquill', {
      url: '/api/email/purchase-confirmation/status',
      sessionId: trimmedSessionId,
    });

    // Explicitly build URL with query string
    const proxiedPath = `/api/email/purchase-confirmation/status?session_id=${encodeURIComponent(trimmedSessionId)}`;
    
    // Proxy to deepquill (canonical DB)
    const { data, status } = await proxyJson(proxiedPath, req, {
      method: 'GET',
    });

    // Return deepquill response verbatim
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[PROXY] email/purchase-confirmation/status error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { 
        ok: false,
        error: 'Failed to fetch email delivery status',
        message: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
