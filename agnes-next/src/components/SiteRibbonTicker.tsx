'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { mergeRibbonTickerSegments, type SignalRibbonEvent } from '@/lib/signalRibbonFeed';

export type SiteRibbonTickerProps = {
  /** Appended after `/api/signal/events` content (motivational, live stats, flash messages). */
  extraSegments?: string[];
  /** Refetch events on an interval (e.g. contest hub). Omit or 0 = fetch on mount only. */
  pollIntervalMs?: number;
};

/**
 * Site-wide ribbon: same continuous ticker as Signal Room / Protocol — content from
 * GET `/api/signal/events` plus optional extra segments in one flowing stream.
 */
export default function SiteRibbonTicker({ extraSegments, pollIntervalMs }: SiteRibbonTickerProps) {
  const [events, setEvents] = useState<SignalRibbonEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/signal/events', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.ok && Array.isArray(d.events)) {
            setEvents(d.events);
          }
        })
        .catch(() => {});
    };
    load();
    if (pollIntervalMs && pollIntervalMs > 0) {
      const id = window.setInterval(load, pollIntervalMs);
      return () => {
        cancelled = true;
        window.clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [pollIntervalMs]);

  const tickerContent = useMemo(
    () => mergeRibbonTickerSegments(events, extraSegments),
    [events, extraSegments]
  );

  return (
    <>
      <div
        style={{
          backgroundColor: 'red',
          color: 'white',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          position: 'fixed',
          bottom: 0,
          width: '100%',
          padding: '0.5rem',
          fontWeight: 'bold',
          fontSize: '14px',
          zIndex: 1000,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            paddingLeft: '100%',
            animation: 'siteRibbonTicker 50s linear infinite',
          }}
        >
          {tickerContent}
        </span>
      </div>
      <style jsx global>{`
        @keyframes siteRibbonTicker {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </>
  );
}
