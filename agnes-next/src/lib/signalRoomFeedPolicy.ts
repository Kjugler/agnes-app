/**
 * Quiet Reveal public feed policy:
 * - Hide beta-era daily bulletins (feedStyle daily_bulletin before Quiet Reveal start).
 * - After start: show at most one daily bulletin (the current one).
 * - Never hides normal user/system signals based on date.
 */
import { isDailyBulletinTags } from '@/lib/parseFeedTags';

/** Quiet Reveal begins April 30, 2026 (UTC). Bulletins before this are beta-era clutter in public feed. */
export const QUIET_REVEAL_START_MS = Date.parse('2026-04-30T00:00:00.000Z');

export function visibleTimeMs(s: {
  approvedAt?: string | Date | null;
  createdAt?: string | Date | null;
}): number {
  const raw = s.approvedAt ?? s.createdAt;
  if (raw == null) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * True when this signal should not have a public detail page (beta bulletin only).
 */
export function isBetaDailyBulletinHiddenFromPublic(s: {
  tags?: unknown;
  approvedAt?: string | Date | null;
  createdAt?: string | Date | null;
}): boolean {
  if (!isDailyBulletinTags(s.tags)) return false;
  return visibleTimeMs(s) < QUIET_REVEAL_START_MS;
}

/**
 * Public Signal Room list: curated bulletins, all other published signals kept.
 */
export function filterPublicSignalRoomFeed<
  T extends {
    tags?: unknown;
    approvedAt?: string | Date | null;
    createdAt?: string | Date | null;
    id?: string;
  },
>(signals: T[]): T[] {
  const nonBulletin: T[] = [];
  const bulletins: T[] = [];
  for (const s of signals) {
    if (isDailyBulletinTags(s.tags)) bulletins.push(s);
    else nonBulletin.push(s);
  }

  const afterStart = bulletins.filter((s) => visibleTimeMs(s) >= QUIET_REVEAL_START_MS);
  let currentBulletin: T[] = [];
  if (afterStart.length > 0) {
    afterStart.sort((a, b) => visibleTimeMs(b) - visibleTimeMs(a));
    currentBulletin = [afterStart[0]];
  }

  return [...nonBulletin, ...currentBulletin];
}
