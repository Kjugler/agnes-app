/**
 * Shared parsing for Signal tags JSON (feedStyle, etc.).
 */

export type FeedTagsMeta = { feedStyle?: string } | null;

export function parseFeedTags(tags: unknown): FeedTagsMeta {
  if (tags == null) return null;
  try {
    const t = typeof tags === 'string' ? JSON.parse(tags) : tags;
    if (t && typeof t === 'object' && 'feedStyle' in t) return t as { feedStyle?: string };
    return null;
  } catch {
    return null;
  }
}

export function isDailyBulletinTags(tags: unknown): boolean {
  return parseFeedTags(tags)?.feedStyle === 'daily_bulletin';
}
