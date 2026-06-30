/** Reader Recommendation Funnel — `/readers-agree` friend landing. */

import { TEXT_A_FRIEND_SITE_URL } from '@/lib/textAFriendOg';

export {
  AMAZON_REVIEWS_URL,
  BARNES_NOBLE_REVIEWS_URL,
  SAMPLE_CHAPTERS_PATH,
} from '@/lib/metaAdLanding';

export const READERS_AGREE_OG_IMAGE_PATH = '/og/readers-agree-v1.jpg';
export const READERS_AGREE_OG_IMAGE_URL = `${TEXT_A_FRIEND_SITE_URL}${READERS_AGREE_OG_IMAGE_PATH}`;
export const READERS_AGREE_HERO_IMAGE_PATH = '/images/rrf/readers-agree-hero-v1.jpg';

export const READERS_AGREE_OG_TITLE = "Readers Agree — See Why They Can't Put It Down";
export const READERS_AGREE_OG_DESCRIPTION =
  'A reader you know thought you would connect with this. Read Amazon and Barnes & Noble reviews, then start 4 free sample chapters.';

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
