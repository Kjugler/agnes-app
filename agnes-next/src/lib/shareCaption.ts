import type { SharePlatform } from './shareAssets';

/**
 * Build consistent share caption across all platforms
 * A5: MUST include book pitch, discount code, vacation + money offer, referral link, secret code, CTA
 */
export function buildShareCaption({
  firstName,
  refCode,
  shareUrl,
  includeSecretCode = true,
  platform,
}: {
  firstName?: string | null;
  refCode: string;
  shareUrl: string;
  includeSecretCode?: boolean;
  platform?: SharePlatform;
}) {
  // X uses the same caption as FB (reuse FB copy)
  // Default caption for all platforms (FB, X, IG, etc.)
  const intro = firstName ? `Hey, it's ${firstName}— ` : '';
  const secretCode = includeSecretCode ? ' #WhereIsJodyVernon' : '';
  
  return `${intro}This book is exploding across the internet. Use my code ${refCode} for 15% off *The Agnes Protocol* and a shot at a 6-day Disney family cruise. You can earn money, rank up, and jump into the full experience.${secretCode} ${shareUrl}`;
}

