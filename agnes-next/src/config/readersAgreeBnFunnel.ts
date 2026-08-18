/** Readers Agree landing — approved copy (Phase B v2 typography + pillars). */

export const READERS_AGREE_V2_PILLARS = [
  'Artificial Intelligence',
  'Media Manipulation',
  'Government Corruption',
] as const;

export const READERS_AGREE_V2_LOCKED_PARAGRAPH =
  'A banking prodigy disappears. A handful of technology experts challenge the most powerful people in America. Orphan boys become part of something no one could have imagined. And somehow, beneath the conspiracy, fraud, and political intrigue, readers discover a story that never loses its heart.';

/** Paid ad / direct traffic — ad-native headline (hero concept). */
export const READERS_AGREE_AD_HEADLINE = "Find Out Why Readers Can't Put It Down";
export const READERS_AGREE_AD_SUBLINE = 'Political Thriller • Nearly All ★★★★★ Reviews';

/** Friend-referral traffic — conditional headline + intro. */
export const READERS_AGREE_REFERRAL_HEADLINE_PREFIX = 'Readers Agree — ';
export const READERS_AGREE_REFERRAL_HEADLINE_EMPHASIS = "See Why They Can't Put It Down";
export const READERS_AGREE_FRIEND_INTRO = "A reader you know thought you'd connect with this.";

/** @deprecated Phase 1 synopsis — replaced by v2 locked paragraph in Phase B. */
export const READERS_AGREE_SYNOPSIS_HOOK =
  "What if the end of truth wasn't an accident—but a strategy?";

/** @deprecated Phase 1 synopsis — replaced by v2 locked paragraph in Phase B. */
export const READERS_AGREE_SYNOPSIS_PARAGRAPHS = [
  'The Agnes Protocol is a fast-paced political thriller about artificial intelligence, media manipulation, government corruption—fraud and money laundering.',
  'Matt and Reese meet as boys in a New York orphanage. A fight becomes a lifelong friendship. They write music on the roof, learn software code, master artificial intelligence and satellite operations, and eventually become confidence men who prey upon corrupt officials—redirecting their gains toward orphanages and assisted living centers.',
  'At the heart of the story is Jody Vernon, a brilliant young woman whose loyalty, courage, and humanity ensure that the technology, political intrigue, and hard-hitting action never overwhelm the novel\'s emotional heart.',
] as const;

/** @deprecated Phase 1 appeal pills — replaced by v2 pillars section. */
export const READERS_AGREE_APPEAL_LABELS = [
  'AI • Media • Corruption',
  'Friendship • Loyalty • Revenge',
  'Fast-Paced—with Heart',
] as const;

export function isReadersAgreeReferralTraffic(searchParams: {
  get: (key: string) => string | null;
}): boolean {
  const ref = searchParams.get('ref')?.trim();
  const code = searchParams.get('code')?.trim();
  return Boolean(ref || code);
}
