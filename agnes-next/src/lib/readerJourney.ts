'use client';

import { JODY_CONCIERGE_CONFIG } from '@/config/jodyConcierge';
import { FUNNEL_EVENT_TYPES, trackFunnelEvent } from '@/lib/funnelTracking';

const DISMISS_KEY = JODY_CONCIERGE_CONFIG.storageKeys.dismissUntil;
const PENDING_KEY = JODY_CONCIERGE_CONFIG.storageKeys.pendingBeat;
const COMPLETED_KEY = JODY_CONCIERGE_CONFIG.storageKeys.chapterCompleted;
const READING_SESSION_KEY = JODY_CONCIERGE_CONFIG.storageKeys.readingSession;

export type JodyReadingSession = {
  chapterId: string;
  startedAt: number;
};

function safeSessionGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Begin or resume a chapter reading session (persists across PDF handoff/remount). */
export function startOrResumeReadingSession(chapterId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = safeSessionGet(READING_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JodyReadingSession;
      if (parsed.chapterId === chapterId && Number.isFinite(parsed.startedAt)) {
        return;
      }
    }
    const session: JodyReadingSession = { chapterId, startedAt: Date.now() };
    safeSessionSet(READING_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function getReadingSession(): JodyReadingSession | null {
  const raw = safeSessionGet(READING_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as JodyReadingSession;
    if (!parsed.chapterId || !Number.isFinite(parsed.startedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getReadingSessionElapsedMs(chapterId: string): number {
  const session = getReadingSession();
  if (!session || session.chapterId !== chapterId) return 0;
  return Math.max(0, Date.now() - session.startedAt);
}

export function isReadingSessionDwellMet(chapterId: string): boolean {
  const minMs = JODY_CONCIERGE_CONFIG.minDwellSecondsBeforeOffer * 1000;
  return getReadingSessionElapsedMs(chapterId) >= minMs;
}

export function clearReadingSession(): void {
  safeSessionSet(READING_SESSION_KEY, null);
}

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function isRememberDismissed(): boolean {
  const until = safeGet(DISMISS_KEY);
  if (!until) return false;
  const ts = Date.parse(until);
  if (!Number.isFinite(ts)) return false;
  return Date.now() < ts;
}

export function dismissRememberOffer() {
  const days = JODY_CONCIERGE_CONFIG.dismissCooldownDays;
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  safeSet(DISMISS_KEY, until);
  clearReadingSession();
}

export function markChapterCompletedForJody(chapterId: string) {
  safeSet(COMPLETED_KEY, chapterId);
  trackFunnelEvent(
    FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED,
    { chapterId },
    { source: 'jody-concierge' },
  );
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(PENDING_KEY, 'remember-offer');
    } catch {
      /* ignore */
    }
  }
}

export function consumePendingJodyBeat(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const beat = window.sessionStorage.getItem(PENDING_KEY);
    if (beat) window.sessionStorage.removeItem(PENDING_KEY);
    return beat;
  } catch {
    return null;
  }
}

export function peekPendingJodyBeat(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function getLastCompletedChapterLocal(): string | null {
  return safeGet(COMPLETED_KEY);
}

export function clearPendingJodyBeat() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
