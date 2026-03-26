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
    'http://localhost:5055', // R7: Allow deepquill origin for terminal access
    siteUrl, // Use configured site URL
  ];
  
  // Allow any localhost port for development (including deepquill)
  const isLocalhost = origin && origin.startsWith('http://localhost:');
  // Allow any ngrok origin (for development via ngrok tunnel)
  // Check for ngrok domains: ngrok.io, ngrok-free.dev, ngrok-free.app, etc.
  const isNgrok = origin && (
    origin.includes('ngrok') || 
    origin.includes('ngrok-free.dev') || 
    origin.includes('ngrok-free.app') ||
    origin.includes('ngrok.io')
  );
  // Also check if siteUrl contains ngrok (in case NEXT_PUBLIC_SITE_URL is set to ngrok)
  const siteUrlIsNgrok = siteUrl && (
    siteUrl.includes('ngrok') || 
    siteUrl.includes('ngrok-free.dev') || 
    siteUrl.includes('ngrok-free.app')
  );
  const isAllowed = origin && (
    isLocalhost || 
    isNgrok || 
    siteUrlIsNgrok ||
    allowedOrigins.some(allowed => origin.startsWith(allowed))
  );
  
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

    // Part A3: Extract referral code from body, query params, or cookies
    const refFromBody = body?.ref || body?.referralCode;
    const refFromQuery = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('referralCode');
    const refFromCookie = req.cookies.get('ap_ref')?.value || req.cookies.get('ref')?.value;
    const referralCode = refFromBody || refFromQuery || refFromCookie || undefined;

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
        ref: referralCode, // Pass referral code to deepquill for lastReferral stamping
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

    // Extract canonical identity from deepquill response
    const email = data.user?.email || emailRaw;
    const userId = data.user?.id;
    const userCode = data.user?.code || data.associate?.code;

    if (!userId) {
      console.error('[PRINCIPAL] MISMATCH - deepquill login did not return userId', { data });
      return NextResponse.json(
        { ok: false, error: 'server_error', message: 'User ID not returned from server' },
        {
          status: 500,
          headers: corsHeaders(origin),
        }
      );
    }

    // Part 3A: Set canonical principal cookies - ALWAYS overwrite any previous value
    // Fix secure detection: use HTTPS protocol, not just production mode
    const cookieStore = await cookies();
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    const isHttps = origin?.startsWith('https://') || req.nextUrl.protocol === 'https:';
    const cookieOptions = {
      httpOnly: true,
      secure: isHttps && !isLocalhost, // Part 3A: Set secure for HTTPS (including ngrok), but not localhost
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    };
    
    // Set canonical principal cookies
    cookieStore.set('contest_email', email, cookieOptions);
    cookieStore.set('contest_user_id', userId, cookieOptions);
    if (userCode) {
      cookieStore.set('contest_user_code', userCode, cookieOptions);
    }

    // Also set a non-HTTP-only cookie for client-side access (for backward compatibility)
    cookieStore.set('user_email', email, {
      ...cookieOptions,
      httpOnly: false,
    });
    
    console.log('[PRINCIPAL] Principal cookies set', {
      userId,
      email,
      code: userCode,
      origin,
      isLocalhost,
      isHttps,
      secure: cookieOptions.secure, // Part 3A: Log actual secure value
    });

    console.log('[contest/login] User logged in successfully (via deepquill)', {
      email,
      userId,
      code: userCode,
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

