import type { SharePlatform } from './shareAssets';

const SITE_ROOT = process.env.NEXT_PUBLIC_SITE_ROOT ?? 'https://TheAgnesProtocol.com';

/**
 * Build consistent share caption across all platforms
 * A5: MUST include book pitch, discount code, vacation + money offer, referral link, secret code, CTA
 * Updated to include TheAgnesProtocol.com domain in all captions
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
  const intro = firstName ? `Hey, it's ${firstName} — ` : 'Hey, ';
  
  const lines = [
    `${intro}this book is exploding across the internet.`,
    `Grab *The Agnes Protocol* at ${SITE_ROOT} and use my code ${refCode} for 15% off and a shot at a 6-day Disney family cruise.`,
    `You can earn money, rank up, and jump into the full experience.`,
    `Play the contest and track your points here: ${shareUrl}`,
  ];

  const tags = includeSecretCode ? '#WhereIsJodyVernon #TheAgnesProtocol' : '#TheAgnesProtocol';

  return `${lines.join('\n')}\n\n${tags}`;
}

