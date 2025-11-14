import type { SharePlatform } from './shareAssets';
import { getNextVariant } from './shareAssets';
import { getNextTarget, type ShareTarget } from './shareTarget';
import { buildShareCaption } from './shareCaption';
import { PROTOCOL_CHALLENGE_PATH, TERMINAL_ENTRY_PATH } from './shareAssets';

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
 * For guided flow: only include the URL, user will paste caption themselves
 */
export function buildPlatformShareUrl(
  platform: SharePlatform,
  shareUrl: string,
  caption: string
): string {
  switch (platform) {
    case 'x': {
      // X (Twitter): open composer with just the URL (user pastes caption)
      return `https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`;
    }
    case 'fb': {
      // Facebook: use sharer with just the URL (user pastes caption)
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    }
    case 'truth': {
      // Truth Social: open shareUrl (user pastes caption)
      return shareUrl;
    }
    case 'ig':
    case 'tt': {
      // Instagram & TikTok: open shareUrl (user pastes caption)
      return shareUrl;
    }
    default:
      return shareUrl;
  }
}

/**
 * Get redirect path based on target
 */
export function getRedirectPath(target: ShareTarget, refCode: string): string {
  const basePath = target === 'terminal' ? TERMINAL_ENTRY_PATH : PROTOCOL_CHALLENGE_PATH;
  const params = new URLSearchParams({ ref: refCode });
  
  // A2: Include secret code for terminal target
  if (target === 'terminal') {
    params.set('secret', 'WhereIsJodyVernon');
  }
  
  return `${basePath}?${params.toString()}`;
}

