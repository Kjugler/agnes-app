import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';

// CORS helper for cross-origin requests
function corsHeaders(origin: string | null) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002';
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174', // Vite might use different port if 5173 is busy
    'http://localhost:3000',
    'http://localhost:3002',
    siteUrl, // Use configured site URL
  ];
  
  // Allow any localhost port for development
  const isLocalhost = origin && origin.startsWith('http://localhost:');
  const isAllowed = origin && (isLocalhost || allowedOrigins.some(allowed => origin.startsWith(allowed)));
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    console.log('[contest/login] OPTIONS preflight request', { origin });
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  } catch (err: any) {
    console.error('[contest/login] OPTIONS error', err);
    const origin = req.headers.get('origin');
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }
}

export async function POST(req: NextRequest) {
  // Track 2.4: Rate limiting
  const rateLimit = rateLimitByIP(req, { maxRequests: 10, windowMs: 60000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { 
        status: 429,
        headers: {
          ...corsHeaders(req.headers.get('origin')),
          'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }
  
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;
    const origin = req.headers.get('origin');

    console.log('[contest/login] Received request (proxying to deepquill)', {
      emailRaw,
      origin,
    });

    if (!emailRaw || typeof emailRaw !== 'string') {
      console.error('[contest/login] Missing or invalid email in request');
      return NextResponse.json(
        { ok: false, error: 'email required' },
        {
          status: 400,
          headers: corsHeaders(origin),
        }
      );
    }

    // Proxy to deepquill (DB owner)
    // Add internal proxy header for security (optional hardening)
    const internalProxySecret = process.env.INTERNAL_PROXY_SECRET || 'dev-only-secret';
    const { data, status } = await proxyJson('/api/contest/login', req, {
      method: 'POST',
      headers: {
        'x-internal-proxy': internalProxySecret,
      },
      body: {
        email: emailRaw,
        origin: origin || undefined,
      },
    });

    if (status !== 200 || !data?.ok) {
      console.error('[contest/login] Deepquill proxy failed', { status, data });
      return NextResponse.json(
        { ok: false, error: data?.error || 'server_error' },
        {
          status: status >= 400 && status < 600 ? status : 500,
          headers: corsHeaders(origin),
        }
      );
    }

    // Extract email from deepquill response (normalized)
    const email = data.user?.email || emailRaw;

    // Set HTTP-only cookie for contest session - ALWAYS overwrite any previous value
    const cookieStore = await cookies();
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    
    // For cross-origin requests (like from localhost:5173), we need to be more permissive
    cookieStore.set('contest_email', email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: isLocalhost ? 'lax' : 'lax', // 'lax' allows cross-site cookies
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Also set a non-HTTP-only cookie for client-side access (for backward compatibility)
    cookieStore.set('user_email', email, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: isLocalhost ? 'lax' : 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    
    console.log('[contest/login] Cookies set', {
      email,
      origin,
      isLocalhost,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    });

    console.log('[contest/login] User logged in successfully (via deepquill)', {
      email,
      userId: data.user?.id,
      greetingName: data.greetingName,
      isReturning: data.isReturning,
    });

    // Return deepquill's response (with cookies set)
    return NextResponse.json(
      {
        ok: true,
        email,
        userId: data.user?.id,
        greetingName: data.greetingName,
        isReturning: data.isReturning,
      },
      {
        headers: corsHeaders(origin),
      }
    );
  } catch (err: any) {
    console.error('[contest/login] Error proxying to deepquill', {
      error: err?.message,
      stack: err?.stack,
    });
    const origin = req.headers.get('origin');
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      {
        status: 500,
        headers: corsHeaders(origin),
      }
    );
  }
}

