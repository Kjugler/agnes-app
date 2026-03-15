/**
 * Training video URL resolution.
 * Uses NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL for external hosting (deployed).
 * Falls back to /training/... for local dev when env var is missing.
 */

export const TRAINING_VIDEO_KEYS = {
  FB_INSTRUCTIONS_IOS: 'fb-instructions-iPhone.mp4',
  FB_INSTRUCTIONS_ANDROID: 'fb-instructions-android.mp4',
  X_INSTRUCTIONS_IOS: 'x-instructions-iPhone.mp4',
  X_INSTRUCTIONS_ANDROID: 'x-instructions-android.mp4',
  TT_INSTRUCTIONS_IOS: 'tt-instructions-ios.mp4',
  TT_INSTRUCTIONS_ANDROID: 'tt-instructions-android.mp4',
  IG_INSTRUCTIONS_IOS: 'ig-instructions-ios.mp4',
  JODY_TIKTOK: 'jody-tiktok-training.mp4',
  JODY_TRUTH: 'jody-truth-training.mp4',
  JODY_IG: 'jody-ig-training.mp4',
} as const;

export type TrainingVideoKey = keyof typeof TRAINING_VIDEO_KEYS;

/**
 * Returns the full URL for a training video.
 * - When NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL is set (deployed): uses external URL.
 * - When env var is missing (local dev): falls back to /training/{filename}.
 */
export function getTrainingVideoUrl(key: TrainingVideoKey): string {
  const base = process.env.NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL;
  const filename = TRAINING_VIDEO_KEYS[key];
  if (base) {
    return `${base.replace(/\/$/, '')}/${filename}`;
  }
  return `/training/${filename}`;
}
