export type SharePlatform = 'fb' | 'ig' | 'x' | 'tt' | 'truth';

export type ShareVariant = 1 | 2 | 3;

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
    },
  },
  ig: {
    variants: {
      1: { video: '/videos/ig1.mp4', thumbnail: '/images/ig1.jpg' },
      2: { video: '/videos/ig2.mp4', thumbnail: '/images/ig2.jpg' },
      3: { video: '/videos/ig3.mp4', thumbnail: '/images/ig3.jpg' },
    },
  },
  x: {
    // Use FB thumbnails and IG videos
    variants: {
      1: { video: '/videos/ig1.mp4', thumbnail: '/images/fb/fb1.jpg' },
      2: { video: '/videos/ig2.mp4', thumbnail: '/images/fb/fb2.jpg' },
      3: { video: '/videos/ig3.mp4', thumbnail: '/images/fb/fb3.jpg' },
    },
  },
  tt: {
    // Reuse Instagram assets for now
    variants: {
      1: { video: '/videos/ig1.mp4', thumbnail: '/images/ig1.jpg' },
      2: { video: '/videos/ig2.mp4', thumbnail: '/images/ig2.jpg' },
      3: { video: '/videos/ig3.mp4', thumbnail: '/images/ig3.jpg' },
    },
  },
  truth: {
    // Reuse Facebook assets for now
    variants: {
      1: { video: '/videos/fb1.mp4', thumbnail: '/images/fb1.jpg' },
      2: { video: '/videos/fb2.mp4', thumbnail: '/images/fb2.jpg' },
      3: { video: '/videos/fb3.mp4', thumbnail: '/images/fb3.jpg' },
    },
  },
};

/**
 * Get eligible variants for rotation (exclude last used)
 */
export function getEligibleVariants(platform: SharePlatform, lastVariant?: ShareVariant): ShareVariant[] {
  const allVariants: ShareVariant[] = [1, 2, 3];
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

