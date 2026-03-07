import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // [PROXY] Log proxy attempt
    const cookieHeader = req.headers.get('cookie') || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    
    const emailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const emailCookie = emailMatch?.[1] ? decodeURIComponent(emailMatch[1]) : null;
    
    console.log('[PROXY] points/me -> deepquill', {
      url: '/api/points/me',
      hasCookie: !!cookieHeader,
      hasUserIdCookie: !!userIdCookie,
      hasEmailCookie: !!emailCookie,
    });

    // Proxy to deepquill (canonical DB)
    const { data, status } = await proxyJson('/api/points/me', req, {
      method: 'GET',
    });

    // Return deepquill response verbatim
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[PROXY] points/me error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Failed to fetch points' },
      { status: 500 }
    );
  }
}
