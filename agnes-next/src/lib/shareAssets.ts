export type SharePlatform = 'fb' | 'ig' | 'x' | 'tt' | 'truth';

export type ShareVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PROTOCOL_CHALLENGE_PATH = '/the-protocol-challenge';
export const TERMINAL_ENTRY_PATH = '/ibm-terminal';

export const shareAssets: Record<SharePlatform, {
  variants: Record<ShareVariant, { video: string; thumbnail: string }>;
}> = {
  fb: {
    variants: {
      1: { video: '/videos/fb1.mp4', thumbnail: '/images/fb/fb1.jpg' },
      2: { video: '/videos/fb2.mp4', thumbnail: '/images/fb/fb2.jpg' },
      3: { video: '/videos/fb3.mp4', thumbnail: '/images/fb/fb3.jpg' },
      4: { video: '/videos/fb4.mp4', thumbnail: '/images/fb/fb4.jpg' },
      5: { video: '/videos/fb5.mp4', thumbnail: '/images/fb/fb5.jpg' },
      6: { video: '/videos/fb6.mp4', thumbnail: '/images/fb/fb6.jpg' },
      7: { video: '/videos/fb7.mp4', thumbnail: '/images/fb/fb7.jpg' },
    },
  },
  ig: {
    variants: {
      1: { video: '/videos/ig1.mp4', thumbnail: '/images/fb/fb1.jpg' },
      2: { video: '/videos/ig2.mp4', thumbnail: '/images/fb/fb2.jpg' },
      3: { video: '/videos/ig3.mp4', thumbnail: '/images/fb/fb3.jpg' },
      4: { video: '/videos/ig4.mp4', thumbnail: '/images/fb/fb4.jpg' },
      5: { video: '/videos/ig5.mp4', thumbnail: '/images/fb/fb5.jpg' },
      6: { video: '/videos/ig6.mp4', thumbnail: '/images/fb/fb6.jpg' },
      7: { video: '/videos/ig7.mp4', thumbnail: '/images/fb/fb7.jpg' },
    },
  },
  x: {
    variants: {
      1: { video: '/videos/x1.mp4', thumbnail: '/images/fb/fb1.jpg' },
      2: { video: '/videos/x2.mp4', thumbnail: '/images/fb/fb2.jpg' },
      3: { video: '/videos/x3.mp4', thumbnail: '/images/fb/fb3.jpg' },
      4: { video: '/videos/x4.mp4', thumbnail: '/images/fb/fb4.jpg' },
      5: { video: '/videos/x5.mp4', thumbnail: '/images/fb/fb5.jpg' },
      6: { video: '/videos/x6.mp4', thumbnail: '/images/fb/fb6.jpg' },
      7: { video: '/videos/x7.mp4', thumbnail: '/images/fb/fb7.jpg' },
    },
  },
  tt: {
    variants: {
      1: { video: '/videos/tiktok1.mp4', thumbnail: '/images/fb/fb1.jpg' },
      2: { video: '/videos/tiktok2.mp4', thumbnail: '/images/fb/fb2.jpg' },
      3: { video: '/videos/tiktok3.mp4', thumbnail: '/images/fb/fb3.jpg' },
      4: { video: '/videos/tiktok4.mp4', thumbnail: '/images/fb/fb4.jpg' },
      5: { video: '/videos/tiktok5.mp4', thumbnail: '/images/fb/fb5.jpg' },
      6: { video: '/videos/tiktok6.mp4', thumbnail: '/images/fb/fb6.jpg' },
      7: { video: '/videos/tiktok7.mp4', thumbnail: '/images/fb/fb7.jpg' },
    },
  },
  truth: {
    variants: {
      1: { video: '/videos/truth1.mp4', thumbnail: '/images/fb/fb1.jpg' },
      2: { video: '/videos/truth2.mp4', thumbnail: '/images/fb/fb2.jpg' },
      3: { video: '/videos/truth3.mp4', thumbnail: '/images/fb/fb3.jpg' },
      4: { video: '/videos/truth4.mp4', thumbnail: '/images/fb/fb4.jpg' },
      5: { video: '/videos/truth5.mp4', thumbnail: '/images/fb/fb5.jpg' },
      6: { video: '/videos/truth6.mp4', thumbnail: '/images/fb/fb6.jpg' },
      7: { video: '/videos/truth7.mp4', thumbnail: '/images/fb/fb7.jpg' },
    },
  },
};

/**
 * Get eligible variants for rotation (exclude last used)
 */
export function getEligibleVariants(platform: SharePlatform, lastVariant?: ShareVariant): ShareVariant[] {
  const allVariants: ShareVariant[] = [1, 2, 3, 4, 5, 6, 7];
  if (!lastVariant) return allVariants;
  return allVariants.filter(v => v !== lastVariant);
}

/**
 * Get next variant for platform (rotates, never repeats last)
 */
export function getNextVariant(platform: SharePlatform): ShareVariant {
  const storageKey = `lastShareVariant_${platform}`;
  const lastVariant = typeof window !== 'undefined'
    ? (localStorage.getItem(storageKey) as ShareVariant | null)
    : null;
  
  const eligible = getEligibleVariants(platform, lastVariant ? Number(lastVariant) as ShareVariant : undefined);
  const next = eligible[Math.floor(Math.random() * eligible.length)];
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(storageKey, String(next));
  }
  
  return next;
}
