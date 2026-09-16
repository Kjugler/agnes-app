/**
 * Keep-my-place YES/NO outcomes for in-chapter Jody.
 * Closing the prompt never leaves the chapter or changes scroll position.
 */

export type RememberPlaceChoice = 'accept' | 'decline';

export type RememberPlaceChoiceResult = {
  persistReadingPosition: boolean;
  navigateAway: boolean;
  remainOnChapter: boolean;
  nextBeat: 'email-capture' | 'remember-decline-ack';
  dismissOffer: boolean;
};

export const JODY_REMEMBER_DECLINE_ACK_MS = 2200;

export function resolveRememberPlaceChoice(
  choice: RememberPlaceChoice,
): RememberPlaceChoiceResult {
  if (choice === 'accept') {
    return {
      persistReadingPosition: true,
      navigateAway: false,
      remainOnChapter: true,
      nextBeat: 'email-capture',
      dismissOffer: false,
    };
  }
  return {
    persistReadingPosition: false,
    navigateAway: false,
    remainOnChapter: true,
    nextBeat: 'remember-decline-ack',
    dismissOffer: true,
  };
}

/** Overlay close must keep the reader on the same chapter URL (iframe scroll is preserved). */
export function chapterPathAfterJodyClose(currentPath: string): string {
  return currentPath;
}
