/** Google Ads (gtag) — global site tag + purchase conversion. Not GTM. */

export const DEFAULT_GOOGLE_ADS_ID = 'AW-18340602294';
/** Website Purchase (manual/code) — from Google Ads conversion action tag setup. */
export const DEFAULT_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL = '3uBuCLqiqtQcELbDva1E';

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

/** Full `send_to` value, e.g. AW-18340602294/AbCdEfGhIjKlMnOpQr */
export function getGoogleAdsPurchaseSendTo(): string | null {
  const explicit = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_SEND_TO?.trim();
  if (explicit) return explicit;

  const id = getGoogleAdsId();
  const label =
    process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL?.trim() ||
    DEFAULT_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL;
  if (id && label) return `${id}/${label}`;

  return null;
}

export function isGoogleAdsEnabled(): boolean {
  return Boolean(getGoogleAdsId());
}

export function isGoogleAdsPurchaseConversionEnabled(): boolean {
  return Boolean(getGoogleAdsPurchaseSendTo());
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

export type GoogleAdsPurchaseProps = {
  transactionId: string;
  value: number;
  currency: string;
};

export function trackGoogleAdsPurchase(props: GoogleAdsPurchaseProps): void {
  if (typeof window === 'undefined' || !isGoogleAdsPurchaseConversionEnabled()) return;
  try {
    const sendTo = getGoogleAdsPurchaseSendTo();
    if (!sendTo) return;

    window.gtag?.('event', 'conversion', {
      send_to: sendTo,
      value: props.value,
      currency: props.currency,
      transaction_id: props.transactionId,
    });
  } catch {
    /* swallow */
  }
}
