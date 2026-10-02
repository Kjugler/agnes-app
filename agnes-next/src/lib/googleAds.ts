/** Google Ads (gtag) — global site tag. Purchase conversion is fired by GTM from the purchase dataLayer event. */

export const DEFAULT_GOOGLE_ADS_ID = 'AW-18340602294';
/** Website Purchase conversion label — used by GTM, not by application gtag conversion events. */
export const DEFAULT_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL = '3uBuCLqiqtQcELbDvalE';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getGoogleAdsId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || DEFAULT_GOOGLE_ADS_ID;
  return id || null;
}

export function isGoogleAdsEnabled(): boolean {
  return Boolean(getGoogleAdsId());
}

/** SPA route change page path (initial config handled by GoogleAds base tag). */
export function pageGoogleAds(pagePath?: string): void {
  if (typeof window === 'undefined' || !isGoogleAdsEnabled()) return;
  try {
    const id = getGoogleAdsId();
    if (!id) return;
    if (pagePath) {
      window.gtag?.('config', id, { page_path: pagePath });
    } else {
      window.gtag?.('config', id);
    }
  } catch {
    /* swallow */
  }
}
