// agnes-next/src/lib/emailBanner.ts
// Mirrors deepquill: transactional emails are not prefixed or wrapped with beta/stress banners.

/** Marker kept for any legacy tests that grep for it; not injected into live emails. */
export const EMAIL_BETA_BANNER_MARKER = '<!--agnes-email-beta-banner-->';

export interface ApplyBannerParams {
  html?: string;
  text?: string;
  subject?: string;
}

export interface ApplyBannerResult {
  html?: string;
  text?: string;
  subject?: string;
}

/**
 * Returns content unchanged. (Legacy beta banner + [PUBLIC BETA TEST] subject prefix removed.)
 */
export function applyGlobalEmailBanner(params: ApplyBannerParams): ApplyBannerResult {
  return { ...params };
}
