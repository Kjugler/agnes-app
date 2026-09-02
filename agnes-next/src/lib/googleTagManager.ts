/** Google Tag Manager container loader. Isolated from Google Ads gtag. */

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

export function getGtmId(): string | null {
  const id = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  if (!id || !GTM_ID_PATTERN.test(id)) return null;
  return id;
}

export function isGtmEnabled(): boolean {
  return Boolean(getGtmId());
}
