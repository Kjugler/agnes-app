/**
 * Active reading time for Jody's chapter invitation.
 * Counts only while the document is on screen and the tab is active.
 */

export const JODY_READER_GATE_MS = 90_000;

export type ActiveReadingClock = {
  accumulatedMs: number;
  /** Wall time when the current active stretch started. Null while paused. */
  runningSinceMs: number | null;
};

export function resolveReaderGateThresholdMs(nodeEnv: string, raw: string | undefined): number {
  if (nodeEnv === 'production') return JODY_READER_GATE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1000 || n > JODY_READER_GATE_MS) return JODY_READER_GATE_MS;
  return Math.floor(n);
}

export function readerGateThresholdMs(): number {
  return resolveReaderGateThresholdMs(
    process.env.NODE_ENV || '',
    process.env.NEXT_PUBLIC_JODY_READER_GATE_MS,
  );
}

export function isActivelyReading(input: {
  visibilityState: string;
  hasFocus: boolean;
  viewerVisible: boolean;
}): boolean {
  return input.visibilityState === 'visible' && input.hasFocus === true && input.viewerVisible === true;
}

export function syncActiveReadingClock(
  clock: ActiveReadingClock,
  nowMs: number,
  active: boolean,
): ActiveReadingClock {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  if (clock.runningSinceMs != null) {
    const stretch = Math.max(0, now - clock.runningSinceMs);
    const accumulatedMs = clock.accumulatedMs + stretch;
    if (!active) return { accumulatedMs, runningSinceMs: null };
    return { accumulatedMs, runningSinceMs: now };
  }
  if (!active) return { accumulatedMs: clock.accumulatedMs, runningSinceMs: null };
  return { accumulatedMs: clock.accumulatedMs, runningSinceMs: now };
}

export function activeReadingElapsedMs(clock: ActiveReadingClock, nowMs: number): number {
  if (clock.runningSinceMs == null) return clock.accumulatedMs;
  const now = Number.isFinite(nowMs) ? nowMs : clock.runningSinceMs;
  return clock.accumulatedMs + Math.max(0, now - clock.runningSinceMs);
}

export function hasReachedReaderGate(elapsedMs: number, thresholdMs: number): boolean {
  return elapsedMs >= thresholdMs;
}
