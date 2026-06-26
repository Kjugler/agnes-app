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

/** Text-a-friend landing: persist 15% discount for checkout (cookie + client sessionStorage). */
function maybeSetTextafriendDiscountCookie(request: NextRequest, response: NextResponse) {
  if (request.nextUrl.searchParams.get('discount') === '15') {
    response.cookies.set('textafriend_discount', '15', {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }
}

/** Set ap_ref / ref cookies from ?ref= on redirect responses. */
function applyReferralCookiesFromRequest(request: NextRequest, response: NextResponse) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && ref.trim() && ref.trim() !== '...') {
    const activeRef = ref.trim();
    response.cookies.set('ap_ref', activeRef, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    response.cookies.set('ref', activeRef, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }
}

/** Redirect to target path, preserving the full query string and referral/discount cookies. */
function redirectPreservingQuery(request: NextRequest, targetPathname: string): NextResponse {
  const destinationUrl = withSameOrigin(request, targetPathname);
  request.nextUrl.searchParams.forEach((value, key) => {
    destinationUrl.searchParams.set(key, value);
  });
  const response = NextResponse.redirect(destinationUrl);
  applyReferralCookiesFromRequest(request, response);
  maybeSetTextafriendDiscountCookie(request, response);
  return response;
}

/** Retired legacy public routes → book entry; active hub at /contest is not redirected. */
const SALES_SITE_REDIRECTS: Record<string, string> = {
  '/': '/contest',
  '/entry': '/sample-chapters',
  '/start': '/sample-chapters',
  '/lightening': '/sample-chapters',
  '/lightning': '/sample-chapters',
  '/contest/signup': '/sample-chapters',
  '/contest/access': '/sample-chapters',
  '/contest/ascension': '/sample-chapters',
  '/contest/beta-rules': '/sample-chapters',
  '/contest/Badges': '/sample-chapters',
  '/contest/share/tiktok': '/sample-chapters',
  '/contest/share/truth': '/sample-chapters',
  '/the-protocol-challenge': '/sample-chapters',
  '/badge': '/sample-chapters',
  '/posted': '/sample-chapters',
  '/terminal': '/sample-chapters',
};

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Exclude ALL terminal-proxy routes from splitter logic (pass through)
  if (
    pathname === '/terminal-proxy' ||
    pathname === '/terminal-proxy/' ||
    pathname.startsWith('/terminal-proxy/')
  ) {
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

  // Legacy contest thank-you → neutral checkout success (preserve session_id)
  if (pathname === '/contest/thank-you') {
    return redirectPreservingQuery(request, '/checkout/success');
  }

  // Reader claim: legacy contest path → neutral reader claim (preserve token)
  if (pathname === '/contest/claim') {
    return redirectPreservingQuery(request, '/reader/claim');
  }

  // Phase 1: redirect retired public contest routes
  const salesRedirect = SALES_SITE_REDIRECTS[pathname];
  if (salesRedirect) {
    return redirectPreservingQuery(request, salesRedirect);
  }

  // Device classification for share routes (single source of truth)
  const isShareRoute = pathname.startsWith('/share/') || pathname.startsWith('/api/share/');
  const isOgPreviewRoute = pathname.startsWith('/p/fb/');
  if (isShareRoute && !isOgPreviewRoute) {
    const response = NextResponse.next();
    if (isBot(request)) {
      return response;
    }
    const deviceOverride = request.nextUrl.searchParams.get('device');
    let device: 'desktop' | 'ios' | 'android' = 'desktop';
    if (deviceOverride === 'ios' || deviceOverride === 'android' || deviceOverride === 'desktop') {
      device = deviceOverride;
    } else {
      device = detectDevice(request);
    }
    response.cookies.set('dq_device', device, {
      maxAge: 60 * 60 * 24,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    if (!request.cookies.get('dq_visitor')) {
      const visitorId = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      response.cookies.set('dq_visitor', visitorId, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
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

  const response = NextResponse.next();

  maybeSetTextafriendDiscountCookie(request, response);

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

  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && ref.trim() && ref.trim() !== '...') {
    const activeRef = ref.trim();
    response.cookies.set('ap_ref', activeRef, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    response.cookies.set('ref', activeRef, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });

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

  const mockEmail = request.nextUrl.searchParams.get('mockEmail');
  if (mockEmail) {
    response.cookies.set('mockEmail', mockEmail, {
      maxAge: 60 * 60 * 24,
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
    '/api/share/:path*',
  ],
};
