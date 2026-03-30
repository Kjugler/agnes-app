/**
 * Training assets live under /public/training/ in repo, or at NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL
 * in production (e.g. Vercel Blob CDN) when files are not in the deployment bundle.
 */
export function getFbInstructionsVideoSrc(tab: 'ios' | 'android'): string {
  const raw =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL : undefined;
  const base = raw?.replace(/\/$/, '');
  const file =
    tab === 'ios' ? 'fb-instructions-iPhone.mp4' : 'fb-instructions-android.mp4';
  if (base) return `${base}/${file}`;
  return `/training/${file}`;
}
