import { prisma } from './db';

/**
 * Get a date key string in YYYY-MM-DD format (UTC)
 * Used for consistent daily tracking across timezones
 */
export function getDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Get the start of today in UTC
 */
export function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if user has already earned daily share points for a platform today
 */
export async function hasDailySharePoints(
  userId: string,
  platform: 'facebook' | 'x' | 'instagram'
): Promise<boolean> {
  const ledgerTypeMap: Record<'facebook' | 'x' | 'instagram', 'SHARE_FB' | 'SHARE_X' | 'SHARE_IG'> = {
    facebook: 'SHARE_FB',
    x: 'SHARE_X',
    instagram: 'SHARE_IG',
  };

  const ledgerType = ledgerTypeMap[platform];
  const todayStart = startOfToday();

  const exists = await prisma.ledger.findFirst({
    where: {
      userId,
      type: ledgerType,
      createdAt: { gte: todayStart },
    },
    select: { id: true },
  });

  return Boolean(exists);
}

/**
 * Award daily share points (100 pts per platform per day)
 * Returns the points awarded (100 if first time today, 0 if already awarded)
 */
export async function awardDailySharePoints(
  userId: string,
  platform: 'facebook' | 'x' | 'instagram'
): Promise<number> {
  const ledgerTypeMap: Record<'facebook' | 'x' | 'instagram', 'SHARE_FB' | 'SHARE_X' | 'SHARE_IG'> = {
    facebook: 'SHARE_FB',
    x: 'SHARE_X',
    instagram: 'SHARE_IG',
  };

  const ledgerType = ledgerTypeMap[platform];
  const todayStart = startOfToday();

  // Check if already awarded today
  const alreadyAwarded = await hasDailySharePoints(userId, platform);

  if (alreadyAwarded) {
    // No new points; share event still counts for tracking/achievements
    return 0;
  }

  // Award 100 points and record in ledger
  const points = 100;

  await prisma.$transaction([
    prisma.ledger.create({
      data: {
        userId,
        type: ledgerType,
        points,
        note: `Daily share ${platform} - ${getDateKey()}`,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { points: { increment: points } },
    }),
  ]);

  return points;
}

