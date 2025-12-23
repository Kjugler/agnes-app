import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type EntryVariant = 'terminal' | 'protocol';

function getEntryVariant(request: NextRequest): EntryVariant {
  // Check for forced variant via query param (for testing)
  const forcedEntry = request.nextUrl.searchParams.get('entry');
  if (forcedEntry === 'terminal' || forcedEntry === 'protocol') {
    return forcedEntry;
  }

  // Check for existing variant cookie
  const existingVariant = request.cookies.get('dq_entry_variant')?.value;
  if (existingVariant === 'terminal' || existingVariant === 'protocol') {
    return existingVariant;
  }

  // No variant exists - assign randomly 50/50
  return Math.random() < 0.5 ? 'terminal' : 'protocol';
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only handle A/B split on root route
  if (pathname === '/') {
    const variant = getEntryVariant(request);
    const terminalUrl = process.env.NEXT_PUBLIC_TERMINAL_URL || 'http://localhost:5173';
    const protocolPath = '/the-protocol-challenge';

    // Preserve src param and other tracking params
    const src = request.nextUrl.searchParams.get('src');
    const ref = request.nextUrl.searchParams.get('ref');

    // Build destination URL
    let destinationUrl: URL;
    if (variant === 'terminal') {
      // Terminal is external URL - use it directly
      destinationUrl = new URL(terminalUrl);
    } else {
      // Protocol is internal - use request.url as base
      destinationUrl = new URL(protocolPath, request.url);
    }

    // Add variant param
    destinationUrl.searchParams.set('v', variant);

    // Preserve src if present
    if (src) {
      destinationUrl.searchParams.set('src', src);
    }

    // Preserve ref if present (will also be set in cookie below)
    if (ref) {
      destinationUrl.searchParams.set('ref', ref);
    }

    // Create redirect response
    const response = NextResponse.redirect(destinationUrl);

    // Set variant cookie (30 days)
    response.cookies.set('dq_entry_variant', variant, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
      sameSite: 'lax',
    });

    // Capture ?ref=CODE and store in cookie (existing behavior)
    if (ref) {
      response.cookies.set('ref', ref, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
      });
    }

    return response;
  }

  // For non-root routes, handle existing cookie logic
  const response = NextResponse.next();

  // Capture ?ref=CODE and store in cookie
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref) {
    response.cookies.set('ref', ref, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
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
  ],
};