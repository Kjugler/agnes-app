/**
 * Canonical ribbon copy from deepquill GET /api/signal/events.
 * Daily contest ribbon rows (id daily-contest-*) are excluded from public UI.
 */

export type SignalRibbonEvent = { id: string; eventText: string; createdAt?: string };

/** Drop synthetic daily-contest lines from ticker merge (defense in depth with SiteRibbonTicker). */
export function filterRibbonEventsForDisplay(events: SignalRibbonEvent[]): SignalRibbonEvent[] {
  return events.filter((e) => {
    const id = e?.id;
    if (id == null) return true;
    if (typeof id !== 'string') return true;
    if (id.startsWith('daily-contest-')) return false;
    return true;
  });
}

export function buildRibbonTickerText(events: SignalRibbonEvent[]): string {
  const filtered = filterRibbonEventsForDisplay(events);
  if (!filtered.length) return '';
  return filtered.map((e) => e.eventText).join(' • ');
}

/**
 * One stream: filtered signal events + optional extra phrases (contest hub stats, etc.).
 */
export function mergeRibbonTickerSegments(
  events: SignalRibbonEvent[],
  extraSegments: string[] | undefined
): string {
  const base = buildRibbonTickerText(events);
  const extras = (extraSegments ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (!base && extras.length === 0) return '';
  if (!base) return extras.join(' • ');
  if (extras.length === 0) return base;
  return [base, ...extras].join(' • ');
}
