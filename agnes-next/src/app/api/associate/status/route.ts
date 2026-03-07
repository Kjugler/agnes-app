'use server';

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(req: NextRequest) {
  try {
    // [PROXY] Log proxy attempt
    const cookieHeader = req.headers.get('cookie') || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    const emailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const emailCookie = emailMatch?.[1] ? decodeURIComponent(emailMatch[1]) : null;
    
    console.log('[PROXY] associate/status -> deepquill', {
      url: '/api/associate/status',
      hasCookie: !!cookieHeader,
      hasUserIdCookie: !!userIdCookie,
      hasEmailCookie: !!emailCookie,
    });

    // Proxy to deepquill (canonical DB)
    const { data, status } = await proxyJson('/api/associate/status', req, {
      method: 'GET',
    });

    // Return deepquill response verbatim
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[PROXY] associate/status error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 }
    );
  }
}
