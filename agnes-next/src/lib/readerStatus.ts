/**
 * Reader Status resolver — client-side session signals + server facts.
 */

import { READER_STATUS, type ReaderStatus } from '@/config/readerStatus';

const KNOWN_KEY = 'ap_reader_known';
const LEFT_AFTER_KNOWN_KEY = 'ap_reader_left_after_known';
const READING_SESSION_KEY = 'ap_reader_reading_active';

export type ReaderStatusInput = {
  /** Server: user has completed a purchase. */
  hasPurchased?: boolean;
  /** Server: Jody email verified (jodyVerifiedAt). */
  isVerified?: boolean;
  /** Client: on /sample-chapters/read/[id]. */
  isOnChapterReader?: boolean;
};

export function resolveReaderStatus(input: ReaderStatusInput): ReaderStatus {
  if (input.hasPurchased) return READER_STATUS.PURCHASER;
  if (input.isVerified && isNewSessionSinceKnown()) return READER_STATUS.RETURNING;
  if (input.isVerified) return READER_STATUS.KNOWN;
  if (input.isOnChapterReader || isReadingThisSession()) return READER_STATUS.READING;
  return READER_STATUS.UNKNOWN;
}

/** Called after email verification succeeds. */
export function markReaderKnown() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KNOWN_KEY, new Date().toISOString());
    window.localStorage.removeItem(LEFT_AFTER_KNOWN_KEY);
  } catch {
    /* ignore */
  }
}

/** Called when a sample chapter reader mounts. */
export function markReadingStarted() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(READING_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearReadingSession() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(READING_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function isReadingThisSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(READING_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * True when reader verified in a prior session and has returned.
 * Set LEFT_AFTER_KNOWN on pagehide after KNOWN; cleared on first RETURNING resolve.
 */
export function isNewSessionSinceKnown(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const known = window.localStorage.getItem(KNOWN_KEY);
    if (!known) return false;
    return window.localStorage.getItem(LEFT_AFTER_KNOWN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Register pagehide listener — call once from useReaderStatus. */
export function registerReaderSessionTracking() {
  if (typeof window === 'undefined') return () => {};

  function onHide() {
    try {
      if (window.localStorage.getItem(KNOWN_KEY)) {
        window.localStorage.setItem(LEFT_AFTER_KNOWN_KEY, '1');
      }
    } catch {
      /* ignore */
    }
  }

  window.addEventListener('pagehide', onHide);
  return () => window.removeEventListener('pagehide', onHide);
}

export function getStoredReaderStatusHints(): {
  isKnownLocally: boolean;
  isReturningLocally: boolean;
} {
  if (typeof window === 'undefined') {
    return { isKnownLocally: false, isReturningLocally: false };
  }
  try {
    const isKnownLocally = Boolean(window.localStorage.getItem(KNOWN_KEY));
    const isReturningLocally =
      isKnownLocally && window.localStorage.getItem(LEFT_AFTER_KNOWN_KEY) === '1';
    return { isKnownLocally, isReturningLocally };
  } catch {
    return { isKnownLocally: false, isReturningLocally: false };
  }
}
