import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { detectDevice, isBot } from '@/lib/device';

type EntryVariant = 'terminal' | 'protocol';
type VariantSource = 'query' | 'cookie' | 'random';

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

/**
 * Set the entry_variant cookie on the response
 * Also sets legacy dq_entry_variant cookie for compatibility
 */
function setVariantCookie(response: NextResponse, variant: EntryVariant): void {
  const cookieOptions = {
    maxAge: 60 * 60 * 24 * 7, // 7 days (604800 seconds)
    path: '/',
    sameSite: 'lax' as const,
  };

  // Set both cookies for compatibility (new and legacy)
  response.cookies.set('entry_variant', variant, cookieOptions);
  response.cookies.set('dq_entry_variant', variant, cookieOptions);
}

/**
 * Set debug headers on the response
 * 5) Add comprehensive debug headers for observability
 */
function setDebugHeaders(
  response: NextResponse,
  variant: EntryVariant,
  source: VariantSource,
  requestedVariant?: string | null,
  destinationPath?: string
): void {
  response.headers.set('x-ap-variant', variant);
  response.headers.set('x-ap-variant-source', source);
  // 5) Enhanced debug headers
  response.headers.set('x-dq-variant-requested', requestedVariant || 'none');
  response.headers.set('x-dq-variant-final', variant);
  response.headers.set('x-dq-variant-source', source === 'query' ? 'forced' : source);
  if (destinationPath) {
    response.headers.set('x-dq-destination', destinationPath);
  }
}

/**
 * Determine entry variant with strict precedence:
 * 1. ?v= query param (highest priority)
 * 2. entry_variant cookie
 * 3. Random 50/50 (if neither exists)
 * 3) Fix cookie variant precedence: cookie shouldn't override default behavior unexpectedly
 */
function getEntryVariant(request: NextRequest): {
  variant: EntryVariant;
  source: VariantSource;
} {
  // Priority 1: Check for v query param (highest priority - always wins)
  const vParam = request.nextUrl.searchParams.get('v');
  if (vParam === 'terminal' || vParam === 'protocol') {
    return { variant: vParam, source: 'query' };
  }

  // Priority 2: Check for forced variant via entry query param (legacy/testing)
  const forcedEntry = request.nextUrl.searchParams.get('entry');
  if (forcedEntry === 'terminal' || forcedEntry === 'protocol') {
    return { variant: forcedEntry, source: 'query' };
  }

  // Priority 3: Check for existing variant cookie (persists choice)
  const cookieVariant = request.cookies.get('entry_variant')?.value;
  if (cookieVariant === 'terminal' || cookieVariant === 'protocol') {
    return { variant: cookieVariant, source: 'cookie' };
  }

  // Priority 4: No variant exists - assign randomly 50/50
  // 3) This is the default behavior when no cookie/query exists
  return {
    variant: Math.random() < 0.5 ? 'terminal' : 'protocol',
    source: 'random',
  };
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

  // Root route → redirect to cinematic entry page (preserves origin)
  if (pathname === '/') {
    // Preserve all query params - use withSameOrigin so ngrok gets correct domain
    const destinationUrl = withSameOrigin(request, '/entry');
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

  // ✅ B) Backwards compatibility: /entry redirects to /start preserving query params
  // This fixes old referral emails that link to /entry?ref=...
  if (pathname === '/entry') {
    // Preserve all query params - use withSameOrigin so ngrok gets correct domain
    const destinationUrl = withSameOrigin(request, '/start');
    request.nextUrl.searchParams.forEach((value, key) => {
      destinationUrl.searchParams.set(key, value);
    });

    // Create redirect response
    const response = NextResponse.redirect(destinationUrl);

    // Capture ?ref=CODE and store in cookie as ap_ref (canonical referral cookie)
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref && ref.trim() && ref.trim() !== '...') {
      response.cookies.set('ap_ref', ref.trim(), {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
        sameSite: 'lax',
      });
      // Also set legacy 'ref' cookie for backward compatibility
      response.cookies.set('ref', ref.trim(), {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
      });
      console.log('[Middleware] /entry -> /start redirect: referral code from query param', {
        ref: ref.trim(),
        destinationUrl: destinationUrl.toString(),
      });
    }

    return response;
  }

  // /start route → run split logic (strict precedence: ?v= > cookie > random)
  // 1) Make /start a pure redirect endpoint (never renders UI)
  // 4) Ensure /start?v=terminal goes straight to terminal with no intro flash
  if (pathname === '/start') {
    // 3) Fix cookie variant precedence: handle reset=1 to clear cookie
    const resetParam = request.nextUrl.searchParams.get('reset');
    if (resetParam === '1') {
      // Clear variant cookie and do fresh random split
      const cleanUrl = withSameOrigin(request, '/start');
      // Preserve other query params except reset
      request.nextUrl.searchParams.forEach((value, key) => {
        if (key !== 'reset') {
          cleanUrl.searchParams.set(key, value);
        }
      });
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.delete('entry_variant');
      response.cookies.delete('dq_entry_variant');
      console.log('[Middleware] /start?reset=1 - cleared variant cookie, redirecting to fresh split');
      return response;
    }
    
    // 1) Get requested variant from query param
    const requestedVariant = request.nextUrl.searchParams.get('v');
    
    // 2) Determine final variant with precedence
    const { variant: finalVariant, source } = getEntryVariant(request);

    // 3) Map variant to destination path
    // 4) For terminal: go directly to terminal-proxy (bypass /terminal page to avoid intro flash)
    const destinationPath =
      finalVariant === 'terminal' ? '/terminal-proxy' : '/the-protocol-challenge';

    // 4) Build destination URL preserving origin and query params
    const destinationUrl = withSameOrigin(request, destinationPath);

    // Preserve all query params from /start (including v= if provided)
    request.nextUrl.searchParams.forEach((value, key) => {
      destinationUrl.searchParams.set(key, value);
    });

    // For terminal-proxy: ensure embed=1 and skipLoad=1 to prevent intro flash
    if (finalVariant === 'terminal') {
      destinationUrl.searchParams.set('embed', '1');
      destinationUrl.searchParams.set('skipLoad', '1');
      // Ensure v=terminal is set
      if (!destinationUrl.searchParams.has('v')) {
        destinationUrl.searchParams.set('v', 'terminal');
      }
    }

    // Only add v param if it wasn't already in the query (preserve user's explicit choice)
    if (!request.nextUrl.searchParams.has('v')) {
      destinationUrl.searchParams.set('v', finalVariant);
    }

    // 5) Log decision with all required fields
    console.log('[Middleware] /start split decision:', {
      incomingUrl: request.url,
      requestedVariant: requestedVariant || 'none',
      finalVariant,
      source: source === 'query' ? 'forced' : source, // Map 'query' to 'forced' for clarity
      destinationPath,
      destinationUrl: destinationUrl.toString(),
    });

    // 4) Create redirect response and return immediately (pure redirect endpoint)
    const response = NextResponse.redirect(destinationUrl);

    // 5) Set debug headers (visible in DevTools → Network → Response Headers)
    // Use finalVariant (the resolved choice) with fallback to prevent crashes
    const debugVariant = finalVariant ?? requestedVariant ?? 'unknown';
    setDebugHeaders(response, debugVariant, source, requestedVariant, destinationPath);

    // 3) Set variant cookie to persist choice (prevents reshuffle on refresh)
    // Query param always overrides cookie (allows reset via ?v=)
    if (source === 'query') {
      setVariantCookie(response, finalVariant); // Update cookie to match override
    } else {
      setVariantCookie(response, finalVariant); // Set cookie from existing or random
    }

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

    // 4) Return immediately - do not continue logic after redirect
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