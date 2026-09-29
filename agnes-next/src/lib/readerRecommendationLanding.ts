/** Reader Recommendation Funnel — `/readers-agree` friend landing. */

import { TEXT_A_FRIEND_SITE_URL } from '@/lib/textAFriendOg';
import { formatDenverYmd } from '@/lib/paperbackOffer';

export {
  AMAZON_REVIEWS_URL,
  BARNES_NOBLE_REVIEWS_URL,
  SAMPLE_CHAPTERS_PATH,
} from '@/lib/metaAdLanding';

/** Pre-Oct. 2 baseline. Do not delete. /readers-agree Amazon outbound uses this through 2026-10-01 Denver. */
export const READERS_AGREE_AMAZON_ATTRIBUTION_URL_CLEAN =
  'https://www.amazon.com/dp/B0GWQBDH66?maas=maas_adg_B1F3C0D9F386C2563E467F32B9954434_afap_abs&ref_=aa_maas&tag=maas';

/** Oct. 2 paperback-experiment Amazon Attribution campaign. No end date. */
export const READERS_AGREE_AMAZON_ATTRIBUTION_URL_OCT2 =
  'https://www.amazon.com/dp/B0GWQBDH66?maas=maas_adg_77A82354D25FFFE4B0719EBAF99C4EC1_afap_abs&ref_=aa_maas&tag=maas';

/** First America/Denver civil day the Oct. 2 Attribution URL is used. Independent of the free-shipping end date. */
export const AMAZON_ATTRIBUTION_OCT2_START_YMD = '2026-10-02';

/** @deprecated Use getReadersAgreeAmazonAttributionUrl(). Alias of the CLEAN baseline. */
export const READERS_AGREE_AMAZON_ATTRIBUTION_URL = READERS_AGREE_AMAZON_ATTRIBUTION_URL_CLEAN;

/** /readers-agree Amazon outbound. Inject `now` only in tests. */
export function getReadersAgreeAmazonAttributionUrl(now: Date = new Date()): string {
  return formatDenverYmd(now) >= AMAZON_ATTRIBUTION_OCT2_START_YMD
    ? READERS_AGREE_AMAZON_ATTRIBUTION_URL_OCT2
    : READERS_AGREE_AMAZON_ATTRIBUTION_URL_CLEAN;
}

export const READERS_AGREE_PATH = '/readers-agree';
export const READERS_AGREE_CATALOG_PATH = '/catalog';
/** Start Reading bypasses sample hub — Chapter 1 direct (B&N funnel). */
export const READERS_AGREE_CHAPTER_1_PATH = '/sample-chapters/read/1';
export const READERS_AGREE_GO_AMAZON_PATH = '/readers-agree/go/amazon';
export const READERS_AGREE_GO_BN_PATH = '/readers-agree/go/bn';

export function buildReadersAgreePathWithTracking(
  pathname: string,
  searchParams: { get: (key: string) => string | null }
): string {
  const params = new URLSearchParams();
  READERS_AGREE_TRACKING_PARAM_KEYS.forEach((key) => {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function buildReadersAgreeShareUrl(referralCode: string | null | undefined): string {
  const path = `${TEXT_A_FRIEND_SITE_URL}${READERS_AGREE_PATH}`;
  const code = referralCode?.trim();
  if (!code) return path;
  const u = new URL(path);
  u.searchParams.set('ref', code);
  return u.toString();
}

export const READERS_AGREE_OG_IMAGE_PATH = '/og/readers-agree-v1.jpg';
export const READERS_AGREE_OG_IMAGE_URL = `${TEXT_A_FRIEND_SITE_URL}${READERS_AGREE_OG_IMAGE_PATH}`;
export const READERS_AGREE_HERO_IMAGE_PATH = '/images/rrf/readers-agree-hero-v1.jpg';

export const READERS_AGREE_OG_TITLE = "Readers Agree — See Why They Can't Put It Down";
export const READERS_AGREE_OG_DESCRIPTION =
  'A reader you know thought you would connect with this. A political thriller about AI, corruption, and friendship—read sample chapters or reviews.';

export const READERS_AGREE_TRACKING_PARAM_KEYS = [
  'ref',
  'src',
  'v',
  'origin',
  'code',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'fbclid',
] as const;
