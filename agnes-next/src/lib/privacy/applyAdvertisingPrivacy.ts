import type { NextRequest, NextResponse } from 'next/server';
import {
  AD_CHOICE_COOKIE,
  PRIVACY_CHOICE_HEADER,
  PRIVACY_COOKIE_MAX_AGE_SECONDS,
  PRIVACY_GPC_HEADER,
  PRIVACY_REGION_COOKIE,
  PRIVACY_REGION_HEADER,
  computeAdvertisingPrivacyStateFromParts,
  privacyCookieSecure,
  type AdvertisingConsentSnapshot,
} from './advertisingConsent';

function readGeoCountry(request: NextRequest): string | null {
  const vercelCountry = request.headers.get('x-vercel-ip-country');
  if (vercelCountry?.trim()) return vercelCountry.trim().toUpperCase();

  if (process.env.NODE_ENV === 'development') {
    const testCountry = request.nextUrl.searchParams.get('privacy_test_country');
    if (testCountry?.trim()) return testCountry.trim().toUpperCase();
  }

  return null;
}

export function computeAdvertisingPrivacyState(request: NextRequest): AdvertisingConsentSnapshot {
  return computeAdvertisingPrivacyStateFromParts({
    geoCountry: readGeoCountry(request),
    existingRegion: request.cookies.get(PRIVACY_REGION_COOKIE)?.value,
    existingChoice: request.cookies.get(AD_CHOICE_COOKIE)?.value,
    secGpc: request.headers.get('sec-gpc'),
  });
}

function cookieOptions(request: NextRequest) {
  return {
    path: '/',
    maxAge: PRIVACY_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax' as const,
    secure: privacyCookieSecure(request.nextUrl.protocol),
    httpOnly: false,
  };
}

export function writeAdvertisingPrivacyCookies(
  request: NextRequest,
  response: NextResponse,
  state: AdvertisingConsentSnapshot,
): void {
  const options = cookieOptions(request);
  response.cookies.set(PRIVACY_REGION_COOKIE, state.region, options);
  if (state.choice === 'unset') {
    if (request.cookies.get(AD_CHOICE_COOKIE)?.value) {
      response.cookies.set(AD_CHOICE_COOKIE, '', { ...options, maxAge: 0 });
    }
  } else {
    response.cookies.set(AD_CHOICE_COOKIE, state.choice, options);
  }
}

export function applyAdvertisingPrivacyHeaders(
  request: NextRequest,
  requestHeaders: Headers,
  state: AdvertisingConsentSnapshot,
): void {
  requestHeaders.set(PRIVACY_REGION_HEADER, state.region);
  requestHeaders.set(PRIVACY_CHOICE_HEADER, state.choice);
  requestHeaders.set(PRIVACY_GPC_HEADER, state.gpc ? '1' : '0');
}

export function applyAdvertisingPrivacyToResponse(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const state = computeAdvertisingPrivacyState(request);
  writeAdvertisingPrivacyCookies(request, response, state);
  return response;
}
