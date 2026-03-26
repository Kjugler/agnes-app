'use client';

import React, { useEffect, useState } from 'react';

type EventItem = { id: string; eventText: string; createdAt: string };

export default function RibbonTicker() {
  const [events, setEvents] = useState<EventItem[]>([]);

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

  const tickerContent =
    events.length > 0
      ? events.map((e) => e.eventText).join(' • ')
      : 'Signal Room Active • Monitoring all channels • Stay alert';

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
