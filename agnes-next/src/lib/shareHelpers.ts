import type { SharePlatform } from './shareAssets';
import { getNextVariant } from './shareAssets';
import { getNextTarget, type ShareTarget } from './shareTarget';
import { buildShareCaption } from './shareCaption';
import { ENTRY_FRONT_DOOR } from '@/lib/entryFrontDoor';

/**
 * Map platform names to associate handle field names
 */
export const platformToHandleField: Record<SharePlatform, keyof {
  x: string;
  instagram: string;
  tiktok: string;
  truth: string;
  facebook?: string;
}> = {
  x: 'x',
  ig: 'instagram',
  tt: 'tiktok',
  truth: 'truth',
  fb: 'facebook' as any, // Facebook handle not in schema, but we'll check anyway
};

/**
 * Check if associate has handle for platform
 * Accepts both API response format (x, instagram, tiktok, truth) and DB format (handleX, handleInstagram, etc.)
 */
export function hasSocialHandle(
  associate: { 
    handleX?: string | null; 
    handleInstagram?: string | null; 
    handleTiktok?: string | null; 
    handleTruth?: string | null;
    x?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    truth?: string | null;
  } | null,
  platform: SharePlatform
): boolean {
  if (!associate) return false;
  
  switch (platform) {
    case 'x':
      return Boolean(associate.handleX || associate.x);
    case 'ig':
      return Boolean(associate.handleInstagram || associate.instagram);
    case 'tt':
      return Boolean(associate.handleTiktok || associate.tiktok);
    case 'truth':
      return Boolean(associate.handleTruth || associate.truth);
    case 'fb':
      // Facebook doesn't have a handle field, so always return true
      return true;
    default:
      return false;
  }
}

/**
 * Build Facebook preview page URL (for playable card post)
 * Used by Desktop and Android flows; NOT the attachment download route
 */
export function buildFbPreviewUrl(
  variant: 1 | 2 | 3,
  refCode: string,
  target: ShareTarget,
  baseUrl: string
): string {
  const params = new URLSearchParams({
    ref: refCode,
    target,
  });
  if (target === 'terminal') {
    params.set('secret', 'WhereIsJodyVernon');
  }
  return `${baseUrl.replace(/\/$/, '')}/p/fb/${variant}?${params.toString()}`;
}

/**
 * Build tracking link for share caption (ensures correct platform in URL)
 */
export function buildTrackingLink(
  platform: SharePlatform,
  variant: 1 | 2 | 3,
  refCode: string,
  target: ShareTarget,
  baseUrl: string
): string {
  const params = new URLSearchParams({
    ref: refCode,
    target,
  });
  if (target === 'terminal') {
    params.set('secret', 'WhereIsJodyVernon');
  }
  return `${baseUrl.replace(/\/$/, '')}/share/${platform}/${variant}?${params.toString()}`;
}

/**
 * Build share URL with proper structure
 */
export function buildShareUrl(
  platform: SharePlatform,
  variant: 1 | 2 | 3,
  refCode: string,
  target: ShareTarget,
  baseUrl: string
): string {
  const params = new URLSearchParams({
    ref: refCode,
    target,
  });
  
  // A2: Include secret code in query params for terminal target
  if (target === 'terminal') {
    params.set('secret', 'WhereIsJodyVernon');
  }
  
  return `${baseUrl}/share/${platform}/${variant}?${params.toString()}`;
}

/**
 * Build platform-specific share composer URL
 * For X: pre-fill tweet text with caption for reduced friction
 * For other platforms: only include the URL, user will paste caption themselves
 */
export function buildPlatformShareUrl(
  platform: SharePlatform,
  shareUrl: string,
  caption: string
): string {
  switch (platform) {
    case 'x': {
      // X (Twitter): pre-fill tweet text with caption (user can still edit)
      return `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}`;
    }
    case 'fb': {
      // Facebook: use sharer with just the URL (user pastes caption)
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    }
    case 'truth': {
      // Truth Social: open shareUrl (user pastes caption)
      return shareUrl;
    }
    case 'ig': {
      return shareUrl;
    }
    case 'tt': {
      // TikTok: open upload page (user uploads video + pastes caption)
      return 'https://www.tiktok.com/upload';
    }
    default:
      return shareUrl;
  }
}

/**
 * Deep-link destination after share landing (if used). Routes through front door.
 */
export function getRedirectPath(target: ShareTarget, refCode: string): string {
  const params = new URLSearchParams({ ref: refCode });
  if (target === 'terminal') {
    params.set('secret', 'WhereIsJodyVernon');
    params.set('v', 'terminal');
  } else {
    params.set('v', 'protocol');
  }
  return `${ENTRY_FRONT_DOOR}?${params.toString()}`;
}

