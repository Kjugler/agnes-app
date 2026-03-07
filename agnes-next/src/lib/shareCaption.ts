import type { SharePlatform } from './shareAssets';

const SITE_ROOT = process.env.NEXT_PUBLIC_SITE_ROOT ?? 'https://TheAgnesProtocol.com';

/**
 * Build platform-specific share caption.
 * X: Trimmed, no secondary link, single hashtag.
 * TT/IG/Truth: Expanded but unified, no secondary link, dual hashtags.
 * All platforms begin with "The internet isn't ready for this."
 * shareUrl is no longer included in captions; referral tracking via discount code.
 */
export function buildShareCaption({
  refCode,
  platform,
  shareUrl: _shareUrl,
  firstName: _firstName,
  includeSecretCode: _includeSecretCode,
}: {
  firstName?: string | null;
  refCode: string;
  shareUrl?: string;
  includeSecretCode?: boolean;
  platform?: SharePlatform;
}) {
  if (platform === 'x') {
    return `The internet isn't ready for this.

*The Agnes Protocol*
15% off with code ${refCode}

${SITE_ROOT}

#TheAgnesProtocol`;
  }

  // TT, IG, Truth — unified expanded version
  return `The internet isn't ready for this.

*The Agnes Protocol* is exploding online.
Use my code ${refCode} for 15% off and a chance to win a 6-day family cruise.

${SITE_ROOT}

#TheAgnesProtocol #WhereIsJodyVernon`;
}
