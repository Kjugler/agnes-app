/**
 * Training/instruction videos: local dev uses `public/training/<filename>`.
 * Production: set `NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL` to your Blob/CDN base (with or without trailing slash).
 * Full URL is always `${normalizedBase}/${filename}` — no duplicate slashes.
 *
 * Canonical Blob filenames (upload as-is next to the base URL):
 * fb-instructions-iPhone.mp4, fb-instructions-android.mp4,
 * x-instructions-iPhone.mp4, x-instructions-android.mp4,
 * tt-instructions-ios.mp4, tt-instructions-android.mp4,
 * ig-instructions-ios.mp4,
 * jody-ig-training.mp4, jody-tiktok-training.mp4, jody-truth-training.mp4
 */
export const TRAINING_VIDEO_FILES = {
  fbInstructionsIos: 'fb-instructions-iPhone.mp4',
  fbInstructionsAndroid: 'fb-instructions-android.mp4',
  xInstructionsIos: 'x-instructions-iPhone.mp4',
  xInstructionsAndroid: 'x-instructions-android.mp4',
  ttInstructionsIos: 'tt-instructions-ios.mp4',
  ttInstructionsAndroid: 'tt-instructions-android.mp4',
  igInstructionsIos: 'ig-instructions-ios.mp4',
  jodyIgTraining: 'jody-ig-training.mp4',
  jodyTiktokTraining: 'jody-tiktok-training.mp4',
  jodyTruthTraining: 'jody-truth-training.mp4',
} as const;

export type TrainingVideoKey = keyof typeof TRAINING_VIDEO_FILES;

function trainingVideoPublicBase(): string | undefined {
  const raw =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL : undefined;
  return raw?.replace(/\/$/, '') || undefined;
}

export function getTrainingVideoSrc(key: TrainingVideoKey): string {
  const file = TRAINING_VIDEO_FILES[key];
  const base = trainingVideoPublicBase();
  if (base) return `${base}/${file}`;
  return `/training/${file}`;
}

export function getFbInstructionsVideoSrc(tab: 'ios' | 'android'): string {
  return getTrainingVideoSrc(tab === 'ios' ? 'fbInstructionsIos' : 'fbInstructionsAndroid');
}
