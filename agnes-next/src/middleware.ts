import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { detectDevice, isBot } from '@/lib/device';

/**
 * Get the public origin for redirects (critical for ngrok).
 * Prefer real incoming host; never return localhost when request came from ngrok.
 */
function getRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  const fallbackOrigin = request.nextUrl.origin;

  // Prefer, in order: x-forwarded-proto + x-forwarded-host, then host, then nextUrl.origin
  let proto = forwardedProto;
  let resolvedHost = forwardedHost || host;
  if (!resolvedHost) {
    return fallbackOrigin;
  }
  if (!proto) proto = request.nextUrl.protocol.replace(':', '');
  if (!proto || proto !== 'http' && proto !== 'https') proto = 'https';

  let origin = `${proto}://${resolvedHost}`;
  if (!origin.startsWith('http')) origin = `https://${resolvedHost}`;

  // Safety: if origin is localhost but request actually came from ngrok, override
  const hostHeader = request.headers.get('host') || '';
  if (origin.includes('localhost') && hostHeader.includes('ngrok-free.dev')) {
    origin = `https://${hostHeader}`;
  }
  if (origin.includes('localhost') && forwardedHost?.includes('ngrok-free.dev')) {
    origin = `https://${forwardedHost}`;
  }

  return origin || fallbackOrigin;
}

/**
 * Build a URL with the correct public origin (never localhost when via ngrok)
 */
function withSameOrigin(request: NextRequest, pathname: string): URL {
  const origin = getRequestOrigin(request);
  try {
    return new URL(pathname, origin);
  } catch {
    return new URL(pathname, request.nextUrl.origin);
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Exclude ALL terminal-proxy routes from splitter logic (pass through)
  // Handle: /terminal-proxy, /terminal-proxy/, /terminal-proxy/*
  if (
    pathname === '/terminal-proxy' ||
    pathname === '/terminal-proxy/' ||
    pathname.startsWith('/terminal-proxy/')
  ) {
    return NextResponse.next();
  }

  // Exclude /terminal route (it's a Next page, not a redirect target)
  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) {
    return NextResponse.next();
  }

  // Fulfillment: protect /admin/fulfillment/* except /admin/fulfillment/auth
  const isFulfillmentRoute = pathname.startsWith('/admin/fulfillment');
  const isFulfillmentAuthPage = pathname === '/admin/fulfillment/auth' || pathname === '/admin/fulfillment/auth/';
  if (isFulfillmentRoute && !isFulfillmentAuthPage) {
    const token = request.cookies.get('fulfillment-token')?.value;
    if (!token || !token.trim()) {
      const authUrl = withSameOrigin(request, `/admin/fulfillment/auth?redirect=${encodeURIComponent(pathname)}`);
      return NextResponse.redirect(authUrl);
    }
  }

  // Contest ops admin (daily summary): same cookie gate as fulfillment
  const isContestAdminRoute = pathname.startsWith('/admin/contest');
  const isContestAdminAuthPage =
    pathname === '/admin/contest/auth' || pathname.startsWith('/admin/contest/auth/');
  if (isContestAdminRoute && !isContestAdminAuthPage) {
    const token = request.cookies.get('fulfillment-token')?.value;
    if (!token || !token.trim()) {
      const authUrl = withSameOrigin(request, `/admin/fulfillment/auth?redirect=${encodeURIComponent(pathname)}`);
      return NextResponse.redirect(authUrl);
    }
  }

  // Spec 1: Root route → Lightning (single cinematic entry)
  if (pathname === '/') {
    const destinationUrl = withSameOrigin(request, '/lightening');
    request.nextUrl.searchParams.forEach((value, key) => {
      destinationUrl.searchParams.set(key, value);
    });

    // Create redirect response
    const response = NextResponse.redirect(destinationUrl);

    // Capture ?ref=CODE and store in cookie as ap_ref (canonical referral cookie)
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref) {
      response.cookies.set('ap_ref', ref, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
        sameSite: 'lax',
      });
      // Also set legacy 'ref' cookie for backward compatibility
      response.cookies.set('ref', ref, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
      });
    }

    return response;
  }

  // Spec 1: /entry and /start → Lightning (backward compat). /entry does NOT render.
  // EntryClient remains in codebase for future secret path reuse (direct nav to /entry would need a bypass).
  if (pathname === '/entry' || pathname === '/start') {
    const destinationUrl = withSameOrigin(request, '/lightening');
    request.nextUrl.searchParams.forEach((value, key) => {
      destinationUrl.searchParams.set(key, value);
    });

    const response = NextResponse.redirect(destinationUrl);

    const ref = request.nextUrl.searchParams.get('ref');
    if (ref && ref.trim() && ref.trim() !== '...') {
      response.cookies.set('ap_ref', ref.trim(), {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
      });
      response.cookies.set('ref', ref.trim(), {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    return response;
  }

  // Device classification for share routes (single source of truth)
  // /share/* and /api/share/* - set dq_device cookie; do NOT run for /p/fb/* (OG preview)
  const isShareRoute = pathname.startsWith('/share/') || pathname.startsWith('/api/share/');
  const isOgPreviewRoute = pathname.startsWith('/p/fb/');
  if (isShareRoute && !isOgPreviewRoute) {
    const response = NextResponse.next();
    // Bot safeguard: never set mobile flows for crawlers (protects OG)
    if (isBot(request)) {
      return response;
    }
    // Debug override: ?device=ios|android|desktop
    const deviceOverride = request.nextUrl.searchParams.get('device');
    let device: 'desktop' | 'ios' | 'android' = 'desktop';
    if (deviceOverride === 'ios' || deviceOverride === 'android' || deviceOverride === 'desktop') {
      device = deviceOverride;
    } else {
      device = detectDevice(request);
    }
    response.cookies.set('dq_device', device, {
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    // Visitor ID for asset rotation (stable per user)
    if (!request.cookies.get('dq_visitor')) {
      const visitorId = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      response.cookies.set('dq_visitor', visitorId, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
    // Preserve ref, target, secret - do not redirect
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref && ref.trim() && ref.trim() !== '...') {
      response.cookies.set('ap_ref', ref.trim(), {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
      response.cookies.set('ref', ref.trim(), {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
    return response;
  }

  // Part 2B: For non-root routes, handle existing cookie logic
  // IMPORTANT: Do NOT redirect based on ref param - only set cookies
  // Routes like /catalog, /checkout, /contest/thank-you should NOT be redirected
  const response = NextResponse.next();

  // Part 1A: Log redirects (for debugging)
  if (process.env.NODE_ENV === 'development') {
    const isRedirect = response.status === 307 || response.status === 308 || response.status === 301 || response.status === 302;
    if (isRedirect) {
      console.log('[MIDDLEWARE] Redirect detected', {
        pathname,
        search: request.nextUrl.search,
        status: response.status,
        location: response.headers.get('location'),
      });
    }
  }

  // Root Cause A Fix: ref query param must always override cookie
  // Capture ?ref=CODE and store in cookie as ap_ref (canonical referral cookie)
  // This does NOT cause redirects - only sets cookies
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && ref.trim() && ref.trim() !== '...') {
    const activeRef = ref.trim();
    // Root Cause A: Query param ref always overrides cookie (prevents stale referral context)
    response.cookies.set('ap_ref', activeRef, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    // Also set legacy 'ref' cookie for backward compatibility
    response.cookies.set('ref', activeRef, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    
    // Log when ref query param overrides cookie
    const existingCookie = request.cookies.get('ap_ref')?.value || request.cookies.get('ref')?.value;
    if (existingCookie && existingCookie !== activeRef) {
      console.log('[Middleware] Referral code from query param overrides cookie', {
        pathname,
        queryRef: activeRef,
        previousCookie: existingCookie,
        note: 'Query param ref always wins (prevents stale referral context)',
      });
    }
  }

  // Allow ?mockEmail=... for dev testing
  const mockEmail = request.nextUrl.searchParams.get('mockEmail');
  if (mockEmail) {
    response.cookies.set('mockEmail', mockEmail, {
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
    // Include api/share for device classification
    '/api/share/:path*',
  ],
};