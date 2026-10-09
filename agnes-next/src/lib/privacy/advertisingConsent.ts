/**
 * Stage 1 advertising-consent state.
 *
 * Storage
 * - Cookie `ap_privacy_region`: `US` | `EU`. Set from Vercel `x-vercel-ip-country`
 *   (or last known region if geo is missing). JavaScript-readable. Max-Age 395 days.
 *   SameSite=Lax. Secure on HTTPS. Not HttpOnly so the client can gate tags immediately.
 * - Cookie `ap_ad_choice`: absent/`unset` | `allow` | `deny`. Same flags as above.
 *
 * Why cookies (not localStorage): middleware and the first HTML response must know
 * region/choice so EU visitors never receive advertising scripts before consent.
 * A cookie is first-party, compact, and available on the request.
 *
 * GPC: browsers that enable Global Privacy Control MUST send `Sec-GPC: 1` on the
 * document request (W3C GPC). Middleware reads that header before tags can mount.
 * `navigator.globalPrivacyControl` is defense in depth for the same preference.
 *
 * Stage 2 (CAPI / Events API / retailer ad events) must call
 * `mayUseAdvertisingMeasurement()` / `getAdvertisingConsentSnapshot()` and must
 * not invent a second ruleset.
 */

export const AD_CHOICE_COOKIE = 'ap_ad_choice';
export const PRIVACY_REGION_COOKIE = 'ap_privacy_region';
export const PRIVACY_REGION_HEADER = 'x-ap-privacy-region';
export const PRIVACY_CHOICE_HEADER = 'x-ap-ad-choice';
export const PRIVACY_GPC_HEADER = 'x-ap-gpc';
export const PRIVACY_CHOICES_EVENT = 'ap-open-privacy-choices';
export const PRIVACY_CHANGE_EVENT = 'ap-privacy-change';

/** 13 months. */
export const PRIVACY_COOKIE_MAX_AGE_SECONDS = 395 * 24 * 60 * 60;

export type PrivacyRegion = 'US' | 'EU';
export type AdChoice = 'unset' | 'allow' | 'deny';
export type AdvertisingDecisionReason =
  | 'gpc'
  | 'deny'
  | 'eu-unset'
  | 'allow'
  | 'us-default';

export type AdvertisingConsentSnapshot = {
  region: PrivacyRegion;
  choice: AdChoice;
  gpc: boolean;
  allowed: boolean;
  reason: AdvertisingDecisionReason;
};

/**
 * ISO 3166-1 alpha-2 codes where advertising cookies need prior consent.
 * EU member states + EEA (IS, LI, NO) + United Kingdom + Switzerland.
 */
export const AD_CONSENT_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
]);

/** First-party advertising cookies this site may create. Do not include operational cookies. */
export const ADVERTISING_COOKIE_NAMES = [
  '_fbp',
  '_fbc',
  '_ttp',
  'ttclid',
  '_uetsid',
  '_uetvid',
  '_uetmsdns',
  '_gcl_au',
  '_gcl_aw',
  '_gcl_dc',
  '_gcl_gb',
  '_ga',
  '_gid',
  '_gat',
] as const;

export function isAdConsentCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return AD_CONSENT_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}

/** Spec-compliant GPC: only the exact field value "1" counts. */
export function requestHasGpc(headerValue: string | null | undefined): boolean {
  return String(headerValue || '').trim() === '1';
}

/**
 * True when the value is a usable ISO 3166-1 alpha-2 country.
 * Empty, XX, and ZZ are treated as unresolved rather than as a known country.
 */
export function isResolvedGeoCountry(countryCode: string | null | undefined): boolean {
  const geo = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(geo)) return false;
  if (geo === 'XX' || geo === 'ZZ') return false;
  return true;
}

export function parsePrivacyRegion(value: string | null | undefined): PrivacyRegion | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'US' || normalized === 'EU') return normalized;
  return null;
}

export function parseAdChoice(value: string | null | undefined): AdChoice {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'allow' || normalized === 'deny') return normalized;
  return 'unset';
}

/**
 * Fail-safe region:
 * - Known EU/UK/CH/EEA geo → EU (ads off until allow).
 * - Known other country (including US) → US.
 * - Unresolved geo (missing, XX, ZZ) + remembered EU → keep EU.
 * - Unresolved geo + no EU memory → US (do not show an EU bar to ordinary U.S./local visitors).
 */
export function resolvePrivacyRegion(input: {
  geoCountry?: string | null;
  existingRegion?: string | null;
}): PrivacyRegion {
  const geo = String(input.geoCountry || '').trim().toUpperCase();
  if (isResolvedGeoCountry(geo)) {
    return isAdConsentCountry(geo) ? 'EU' : 'US';
  }
  const existing = parsePrivacyRegion(input.existingRegion);
  if (existing === 'EU') return 'EU';
  return 'US';
}

export function computeAdvertisingPrivacyStateFromParts(input: {
  geoCountry?: string | null;
  existingRegion?: string | null;
  existingChoice?: string | null;
  secGpc?: string | null;
}): AdvertisingConsentSnapshot {
  const region = resolvePrivacyRegion({
    geoCountry: input.geoCountry,
    existingRegion: input.existingRegion,
  });
  const gpc = requestHasGpc(input.secGpc);
  const choice = gpc ? 'deny' : parseAdChoice(input.existingChoice);
  return buildAdvertisingConsentSnapshot({ region, choice, gpc });
}

export function decideAdvertisingMeasurement(input: {
  region: PrivacyRegion;
  choice: AdChoice;
  gpc: boolean;
}): { allowed: boolean; reason: AdvertisingDecisionReason } {
  if (input.gpc) return { allowed: false, reason: 'gpc' };
  if (input.choice === 'deny') return { allowed: false, reason: 'deny' };
  if (input.region === 'EU') {
    if (input.choice === 'allow') return { allowed: true, reason: 'allow' };
    return { allowed: false, reason: 'eu-unset' };
  }
  if (input.choice === 'allow') return { allowed: true, reason: 'allow' };
  return { allowed: true, reason: 'us-default' };
}

export function buildAdvertisingConsentSnapshot(input: {
  region: PrivacyRegion;
  choice: AdChoice;
  gpc: boolean;
}): AdvertisingConsentSnapshot {
  const decision = decideAdvertisingMeasurement(input);
  return {
    region: input.region,
    choice: input.choice,
    gpc: input.gpc,
    allowed: decision.allowed,
    reason: decision.reason,
  };
}

export function privacyCookieSecure(protocol: string | null | undefined): boolean {
  return String(protocol || '').replace(/:$/, '') === 'https';
}

export function advertisingChoiceNeedsEuPrompt(snapshot: AdvertisingConsentSnapshot): boolean {
  return snapshot.region === 'EU' && snapshot.choice === 'unset' && !snapshot.gpc;
}
