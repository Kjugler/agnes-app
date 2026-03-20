import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Root and entry aliases → Lightening (cinematic entry page)
  if (pathname === '/' || pathname === '/start' || pathname === '/entry') {
    const destinationUrl = new URL('/lightening', request.url);
    request.nextUrl.searchParams.forEach((value, key) => {
      destinationUrl.searchParams.set(key, value);
    });

    const response = NextResponse.redirect(destinationUrl);

    // Capture ?ref=CODE and store in cookie
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref) {
      response.cookies.set('ref', ref, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
        sameSite: 'lax',
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