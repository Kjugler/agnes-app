/**
 * Google Consent Mode v2 helpers.
 *
 * These commands only speak Google's consent API. They do not change
 * decideAdvertisingMeasurement() / mayUseAdvertisingMeasurement().
 * Denied visitors still must not load GTM or gtag.js.
 */

export const GOOGLE_CONSENT_MODE_PARAMS = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
] as const;

export type GoogleConsentModeParam = (typeof GOOGLE_CONSENT_MODE_PARAMS)[number];
export type GoogleConsentValue = 'granted' | 'denied';
export type GoogleConsentModeState = Record<GoogleConsentModeParam, GoogleConsentValue>;

export function googleConsentModeState(allowed: boolean): GoogleConsentModeState {
  const value: GoogleConsentValue = allowed ? 'granted' : 'denied';
  return {
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
    analytics_storage: value,
  };
}

/** Inline bootstrap: dataLayer + gtag queue + consent default. No network URLs. */
export function buildGoogleConsentDefaultScript(allowed: boolean): string {
  const stateJson = JSON.stringify(googleConsentModeState(allowed));
  return `(function(){window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',${stateJson});})();`;
}

export function scriptContainsGoogleNetworkRequest(script: string): boolean {
  return /googletagmanager\.com|googleads\.g\.doubleclick|google-analytics\.com|gtag\/js\?id=/i.test(
    script,
  );
}
