'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getMetaPixelId,
  isMetaPixelDebugMode,
  isMetaPixelEnabled,
  type MetaPixelDebugEntry,
} from '@/lib/metaPixel';

/**
 * On-page verifier: append ?pixel_debug=1 to any URL (or set NEXT_PUBLIC_META_PIXEL_DEBUG=true).
 * Shows recent Meta Pixel events and fbq load status.
 */
export default function MetaPixelDebugPanel() {
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<MetaPixelDebugEntry[]>([]);
  const [fbqLoaded, setFbqLoaded] = useState(false);

  const debugActive =
    searchParams.get('pixel_debug') === '1' ||
    process.env.NEXT_PUBLIC_META_PIXEL_DEBUG === 'true';

  useEffect(() => {
    if (!debugActive) return;

    setFbqLoaded(typeof window.fbq === 'function');
    setEvents(window.__metaPixelDebugEvents || []);

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<MetaPixelDebugEntry>).detail;
      if (detail) {
        setEvents((prev) => [detail, ...prev].slice(0, 10));
      }
      setFbqLoaded(typeof window.fbq === 'function');
    };

    window.addEventListener('meta-pixel-event', onEvent);
    return () => window.removeEventListener('meta-pixel-event', onEvent);
  }, [debugActive]);

  if (!debugActive) return null;

  const pixelId = getMetaPixelId();
  const enabled = isMetaPixelEnabled();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 99999,
        maxWidth: 320,
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.88)',
        border: '1px solid #1877f2',
        borderRadius: 8,
        color: '#e8f0fe',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        lineHeight: 1.4,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#1877f2' }}>
        Meta Pixel debug
      </div>
      <div>ID: {pixelId || '(unset)'}</div>
      <div>Enabled: {enabled ? 'yes' : 'no'}</div>
      <div>fbq loaded: {fbqLoaded ? 'yes' : 'no'}</div>
      <div style={{ marginTop: 8, fontWeight: 600 }}>Recent events:</div>
      {events.length === 0 ? (
        <div style={{ opacity: 0.7 }}>None yet — navigate or trigger checkout.</div>
      ) : (
        <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
          {events.map((ev, i) => (
            <li key={`${ev.at}-${i}`}>
              {ev.event}
              {ev.props?.value != null ? ` ($${ev.props.value})` : ''}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 6, opacity: 0.65, fontSize: 10 }}>
        Remove ?pixel_debug=1 to hide. Also use Meta Pixel Helper (Chrome).
      </div>
    </div>
  );
}
