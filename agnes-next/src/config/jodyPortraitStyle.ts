/**
 * Shared crop for /jody-icons/jody-em2.png in circular frames.
 * Tune object-position only — do not replace artwork or resize circles.
 */
export const JODY_EM2_PORTRAIT_OBJECT_POSITION = '50% 44%';

export const jodyEm2PortraitCropStyle = {
  objectFit: 'cover' as const,
  objectPosition: JODY_EM2_PORTRAIT_OBJECT_POSITION,
  display: 'block' as const,
};

/** Inline CSS for email templates (keep in sync with JODY_EM2_PORTRAIT_OBJECT_POSITION). */
export const JODY_EM2_PORTRAIT_CROP_CSS =
  'object-fit:cover;object-position:50% 32%;display:block;';
