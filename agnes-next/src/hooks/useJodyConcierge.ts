'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { READER_STATUS } from '@/config/readerStatus';
import { JODY_CONCIERGE_CONFIG } from '@/config/jodyConcierge';
import { isJodyConciergeEnabled } from '@/lib/funnelConfig';
import {
  isRememberDismissed,
  markChapterCompletedForJody,
  consumePendingJodyBeat,
} from '@/lib/readerJourney';
import { useReaderStatus } from '@/hooks/useReaderStatus';

const REMEMBER_ELIGIBLE = new Set<string>([
  READER_STATUS.UNKNOWN,
  READER_STATUS.READING,
]);

export function useJodyChapterExit(chapterId: string) {
  const startRef = useRef(Date.now());
  const dwellMetRef = useRef(false);
  const [showJody, setShowJody] = useState(false);
  const { status, loaded } = useReaderStatus({ markReading: true });

  const isTargetChapter =
    chapterId === JODY_CONCIERGE_CONFIG.firstAppearAfterChapter;

  const canOfferRemember = REMEMBER_ELIGIBLE.has(status);

  useEffect(() => {
    if (!isJodyConciergeEnabled() || !isTargetChapter) return;

    const minMs = JODY_CONCIERGE_CONFIG.minDwellSecondsBeforeOffer * 1000;

    const interval = setInterval(() => {
      if (Date.now() - startRef.current >= minMs) {
        dwellMetRef.current = true;
      }
    }, 5000);

    function onPageHide() {
      if (!dwellMetRef.current || isRememberDismissed()) return;
      if (!canOfferRemember) return;
      markChapterCompletedForJody(chapterId);
    }

    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [chapterId, isTargetChapter, canOfferRemember]);

  const tryShowOnExit = useCallback(
    (navigate: () => void) => {
      if (!isJodyConciergeEnabled() || !isTargetChapter || !loaded) {
        navigate();
        return;
      }
      if (!canOfferRemember) {
        navigate();
        return;
      }
      if (!dwellMetRef.current) {
        navigate();
        return;
      }
      if (isRememberDismissed()) {
        markChapterCompletedForJody(chapterId);
        navigate();
        return;
      }

      markChapterCompletedForJody(chapterId);
      setShowJody(true);
    },
    [chapterId, isTargetChapter, loaded, canOfferRemember],
  );

  const dismissJody = useCallback(() => {
    setShowJody(false);
  }, []);

  return {
    showJody,
    tryShowOnExit,
    dismissJody,
    isTargetChapter,
    readerStatus: status,
  };
}

export function useJodyHubEntry() {
  const [showReturnWelcome, setShowReturnWelcome] = useState(false);
  const [showPendingRemember, setShowPendingRemember] = useState(false);
  const trackedReturnRef = useRef(false);
  const { status, serverState, loaded } = useReaderStatus();

  useEffect(() => {
    if (!isJodyConciergeEnabled() || !loaded) return;

    const pending = consumePendingJodyBeat();
    if (
      pending === 'remember-offer' &&
      !isRememberDismissed() &&
      REMEMBER_ELIGIBLE.has(status)
    ) {
      setShowPendingRemember(true);
      return;
    }

    if (status === READER_STATUS.RETURNING && serverState?.lastCompletedChapterId) {
      setShowReturnWelcome(true);
      if (!trackedReturnRef.current) {
        trackedReturnRef.current = true;
        import('@/lib/funnelTracking').then(({ trackFunnelEvent, FUNNEL_EVENT_TYPES }) => {
          trackFunnelEvent(
            FUNNEL_EVENT_TYPES.RETURNED_WITH_JODY,
            {
              lastCompletedChapterId: serverState.lastCompletedChapterId,
              readerStatus: status,
            },
            { source: 'sample-chapters-hub' },
          );
        });
      }
    }
  }, [loaded, status, serverState]);

  return {
    showReturnWelcome,
    showPendingRemember,
    readerState: serverState,
    readerStatus: status,
    dismissReturn: () => setShowReturnWelcome(false),
    dismissPending: () => setShowPendingRemember(false),
  };
}
