'use client';

import { useState, useEffect } from 'react';
import { mapSignalsMeRows, type MappedMySignal } from '@/lib/mapSignalsMeResponse';

export function useSignalRoomPostingIdentity(feedRefreshTrigger: number): {
  loading: boolean;
  canPost: boolean;
  mySignals: MappedMySignal[];
} {
  const [loading, setLoading] = useState(true);
  const [canPost, setCanPost] = useState(false);
  const [mySignals, setMySignals] = useState<MappedMySignal[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/signals/me', { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (r.ok && d.ok === true && Array.isArray(d.signals)) {
          setCanPost(true);
          setMySignals(mapSignalsMeRows(d.signals as Record<string, unknown>[]));
        } else {
          setCanPost(false);
          setMySignals([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanPost(false);
          setMySignals([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [feedRefreshTrigger]);

  return { loading, canPost, mySignals };
}
