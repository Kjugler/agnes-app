import { READERS_AGREE_TRACKING_PARAM_KEYS } from '@/lib/readerRecommendationLanding';

/** Preserve funnel attribution from /readers-agree and bridge → catalog → checkout. */
export function buildCatalogTrackingParams(
  searchParams: { get: (key: string) => string | null },
): URLSearchParams {
  const params = new URLSearchParams();
  READERS_AGREE_TRACKING_PARAM_KEYS.forEach((key) => {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  });
  return params;
}
