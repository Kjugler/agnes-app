'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReaderStatus } from '@/config/readerStatus';
import { fetchJodyReaderState, type JodyReaderState } from '@/lib/jodyConciergeApi';
import {
  markReadingStarted,
  registerReaderSessionTracking,
  resolveReaderStatus,
} from '@/lib/readerStatus';

type UseReaderStatusOptions = {
  /** When true, marks READING for this session (chapter reader mount). */
  markReading?: boolean;
};

/**
 * Single hook for Jody and sample-chapter surfaces to know reader lifecycle stage.
 */
export function useReaderStatus(options: UseReaderStatusOptions = {}) {
  const pathname = usePathname();
  const [serverState, setServerState] = useState<JodyReaderState | null>(null);
  const [loaded, setLoaded] = useState(false);

  const isOnChapterReader = Boolean(pathname?.match(/^\/sample-chapters\/read\/[^/]+$/));

  useEffect(() => {
    return registerReaderSessionTracking();
  }, []);

  useEffect(() => {
    if (options.markReading || isOnChapterReader) {
      markReadingStarted();
    }
  }, [options.markReading, isOnChapterReader]);

  useEffect(() => {
    let cancelled = false;
    fetchJodyReaderState()
      .then((state) => {
        if (!cancelled) setServerState(state);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const status: ReaderStatus = useMemo(
    () =>
      resolveReaderStatus({
        hasPurchased: serverState?.hasPurchased ?? false,
        isVerified: serverState?.isVerified ?? false,
        isOnChapterReader,
      }),
    [serverState, isOnChapterReader],
  );

  return {
    status,
    serverState,
    loaded,
    isOnChapterReader,
  };
}
