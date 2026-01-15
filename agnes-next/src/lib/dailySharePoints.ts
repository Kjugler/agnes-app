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
 * Always returns false (Ledger removed - daily share checks disabled)
 */
export async function hasDailySharePoints(
  userId: string,
  platform: 'facebook' | 'x' | 'instagram'
): Promise<boolean> {
  // Ledger removed - daily share checks disabled
  return false;
}

/**
 * Award daily share points (100 pts per platform per day)
 * Returns the points awarded (always 0 - Ledger removed, daily share checks disabled)
 */
export async function awardDailySharePoints(
  userId: string,
  platform: 'facebook' | 'x' | 'instagram'
): Promise<number> {
  // Ledger removed - daily share checks disabled
  // Share events still count for tracking/achievements, but no points awarded
  return 0;
}

