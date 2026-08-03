/** Reader Recommendation Funnel — `/readers-agree` friend landing. */

import { TEXT_A_FRIEND_SITE_URL } from '@/lib/textAFriendOg';

export {
  AMAZON_REVIEWS_URL,
  BARNES_NOBLE_REVIEWS_URL,
  SAMPLE_CHAPTERS_PATH,
} from '@/lib/metaAdLanding';

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
