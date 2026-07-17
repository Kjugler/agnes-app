'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { READER_STATUS } from '@/config/readerStatus';
import { JODY_CONCIERGE_CONFIG } from '@/config/jodyConcierge';
import { isJodyConciergeEnabled } from '@/lib/funnelConfig';
import {
  clearReadingSession,
  consumePendingJodyBeat,
  getReadingSessionElapsedMs,
  isReadingSessionDwellMet,
  isRememberDismissed,
  markChapterCompletedForJody,
  startOrResumeReadingSession,
} from '@/lib/readerJourney';
import { useReaderStatus } from '@/hooks/useReaderStatus';

const REMEMBER_ELIGIBLE = new Set<string>([
  READER_STATUS.UNKNOWN,
  READER_STATUS.READING,
]);

function armRememberOfferIfEligible(
  chapterId: string,
  canOfferRemember: boolean,
): boolean {
  if (!canOfferRemember || isRememberDismissed()) return false;
  if (!isReadingSessionDwellMet(chapterId)) return false;
  markChapterCompletedForJody(chapterId);
  clearReadingSession();
  return true;
}

export function useJodyChapterExit(chapterId: string) {
  const [showJody, setShowJody] = useState(false);
  const rememberOfferShownRef = useRef(false);
  const { status, loaded } = useReaderStatus({ markReading: true });

  const isTargetChapter =
    chapterId === JODY_CONCIERGE_CONFIG.firstAppearAfterChapter;

  const canOfferRemember = REMEMBER_ELIGIBLE.has(status);

  const tryShowRememberOfferOnChapter = useCallback((): boolean => {
    if (rememberOfferShownRef.current) return true;
    if (!isJodyConciergeEnabled() || !isTargetChapter || !loaded) return false;
    if (!canOfferRemember) return false;
    if (isRememberDismissed()) return false;
    if (!isReadingSessionDwellMet(chapterId)) return false;

    rememberOfferShownRef.current = true;
    markChapterCompletedForJody(chapterId);
    clearReadingSession();
    setShowJody(true);
    return true;
  }, [chapterId, isTargetChapter, loaded, canOfferRemember]);

  useEffect(() => {
    if (!isJodyConciergeEnabled() || !isTargetChapter) return;

    startOrResumeReadingSession(chapterId);

    let dwellTimer: number | undefined;

    const evaluateWhenActive = () => {
      if (document.visibilityState === 'hidden') return;
      tryShowRememberOfferOnChapter();
    };

    const scheduleDwellEvaluation = () => {
      if (dwellTimer !== undefined) {
        clearTimeout(dwellTimer);
        dwellTimer = undefined;
      }
      if (rememberOfferShownRef.current) return;

      const minMs = JODY_CONCIERGE_CONFIG.minDwellSecondsBeforeOffer * 1000;
      const remaining = minMs - getReadingSessionElapsedMs(chapterId);
      if (remaining <= 0) return;

      dwellTimer = window.setTimeout(() => {
        dwellTimer = undefined;
        evaluateWhenActive();
      }, remaining + 50);
    };

    function onPageHide() {
      if (rememberOfferShownRef.current) return;
      armRememberOfferIfEligible(chapterId, canOfferRemember);
    }

    function onPageShow() {
      evaluateWhenActive();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        evaluateWhenActive();
      }
    }

    function onFocus() {
      evaluateWhenActive();
    }

    evaluateWhenActive();
    scheduleDwellEvaluation();

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      if (dwellTimer !== undefined) clearTimeout(dwellTimer);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    chapterId,
    isTargetChapter,
    canOfferRemember,
    loaded,
    tryShowRememberOfferOnChapter,
  ]);

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
      if (!isReadingSessionDwellMet(chapterId)) {
        navigate();
        return;
      }
      if (isRememberDismissed()) {
        markChapterCompletedForJody(chapterId);
        clearReadingSession();
        navigate();
        return;
      }

      if (tryShowRememberOfferOnChapter()) return;
      navigate();
    },
    [chapterId, isTargetChapter, loaded, canOfferRemember, tryShowRememberOfferOnChapter],
  );

  const dismissJody = useCallback(() => {
    setShowJody(false);
    clearReadingSession();
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

    const targetChapter = JODY_CONCIERGE_CONFIG.firstAppearAfterChapter;
    if (
      armRememberOfferIfEligible(targetChapter, REMEMBER_ELIGIBLE.has(status))
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

  const dismissPending = useCallback(() => {
    setShowPendingRemember(false);
    clearReadingSession();
  }, []);

  return {
    showReturnWelcome,
    showPendingRemember,
    readerState: serverState,
    readerStatus: status,
    dismissReturn: () => setShowReturnWelcome(false),
    dismissPending,
  };
}
