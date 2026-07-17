/**
 * Jody Concierge timing and behavior (Phase 1).
 * Reader lifecycle: see @/config/readerStatus.ts (UNKNOWN → READING → KNOWN → RETURNING → PURCHASER).
 */

export type JodyChapterId = '1' | '2' | '9' | '45';

export const JODY_CONCIERGE_CONFIG = {
  /** Chapter ID after which Jody may offer "Remember My Place" on exit. */
  firstAppearAfterChapter: '1' as JodyChapterId,

  /** Minimum seconds on chapter page before exit counts as "finished". */
  minDwellSecondsBeforeOffer: 90,

  /** Suggested next chapter after completing a given chapter. */
  nextChapterAfter: {
    '1': '2',
    '2': '9',
    '9': '45',
  } as Partial<Record<JodyChapterId, JodyChapterId>>,

  /** Days to respect "Not Now" before re-offering remember-place. */
  dismissCooldownDays: 7,

  /** localStorage keys (versioned). */
  storageKeys: {
    dismissUntil: 'ap_jody_remember_dismiss_until',
    pendingBeat: 'ap_jody_pending_beat',
    chapterCompleted: 'ap_jody_chapter_completed',
    /** sessionStorage — survives native PDF handoff within the same tab. */
    readingSession: 'ap_jody_reading_session',
  },
} as const;

export function getNextChapterId(completedChapterId: string): string | null {
  const map = JODY_CONCIERGE_CONFIG.nextChapterAfter;
  return (map as Record<string, string>)[completedChapterId] ?? null;
}
