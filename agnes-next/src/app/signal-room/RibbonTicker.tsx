'use client';

import React, { useEffect, useState } from 'react';
import { buildRibbonTickerText, type SignalRibbonEvent } from '@/lib/signalRibbonFeed';

export default function RibbonTicker() {
  const [events, setEvents] = useState<SignalRibbonEvent[]>([]);

  useEffect(() => {
    fetch('/api/signal/events')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.events)) {
          setEvents(d.events);
        }
      })
      .catch(() => {});
  }, []);

  const tickerContent = buildRibbonTickerText(events);

  return (
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
          animation: 'ticker 25s linear infinite',
        }}
      >
        {tickerContent}
      </span>
    </div>
  );
}
