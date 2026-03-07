'use server';

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function POST(req: NextRequest) {
  try {
    // [PROXY] Log proxy attempt
    const cookieHeader = req.headers.get('cookie') || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    const emailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const emailCookie = emailMatch?.[1] ? decodeURIComponent(emailMatch[1]) : null;
    
    console.log('[PROXY] contest/join -> deepquill', {
      url: '/api/contest/join',
      hasCookie: !!cookieHeader,
      hasUserIdCookie: !!userIdCookie,
      hasEmailCookie: !!emailCookie,
    });

    // Proxy to deepquill (canonical DB)
    const { data, status } = await proxyJson('/api/contest/join', req, {
      method: 'POST',
    });

    // Return deepquill response verbatim
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[PROXY] contest/join error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 }
    );
  }
}
