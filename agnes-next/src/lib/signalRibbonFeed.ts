/**
 * Canonical ribbon copy comes from deepquill GET /api/signal/events
 * (SignalEvent rows + synthetic daily contest line when present).
 */

export type SignalRibbonEvent = { id: string; eventText: string; createdAt?: string };

export function defaultRibbonFallbackText(): string {
  return 'Signal Room Active • Monitoring all channels • Stay alert';
}

export function buildRibbonTickerText(events: SignalRibbonEvent[]): string {
  if (!events.length) return defaultRibbonFallbackText();
  return events.map((e) => e.eventText).join(' • ');
}

/**
 * One continuous stream: canonical signal events (incl. daily contest line) + optional extra phrases
 * (motivational, live stats, etc.), same separator as the rest of the ribbon.
 */
export function mergeRibbonTickerSegments(
  events: SignalRibbonEvent[],
  extraSegments: string[] | undefined
): string {
  const base = buildRibbonTickerText(events);
  const extras = (extraSegments ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (extras.length === 0) return base;
  return [base, ...extras].join(' • ');
}

/** Synthetic row prepended by deepquill when a DailyContestSummary exists. */
export function extractDailyContestRibbonLine(events: SignalRibbonEvent[]): string | null {
  const first = events[0];
  if (first && typeof first.id === 'string' && first.id.startsWith('daily-contest-')) {
    return first.eventText || null;
  }
  return null;
}
