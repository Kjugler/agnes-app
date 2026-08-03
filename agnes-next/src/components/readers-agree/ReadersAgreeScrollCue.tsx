'use client';

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

const SESSION_KEY = 'ap_ra_more_below_dismissed';
const SCROLL_DISMISS_PX = 35;
/** Below Jody/modals (typically 9999+) but above page content. */
const CUE_Z_INDEX = 2;

function isSessionDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markSessionDismissed(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

type ReadersAgreeScrollCueProps = {
  /** Start Reading button — cue shows when this element is not fully visible. */
  startReadingRef: RefObject<HTMLElement | null>;
};

/**
 * "More Below" — first-visit scroll affordance. IntersectionObserver on Start Reading;
 * dismisses after intentional scroll; sessionStorage per visit.
 */
export default function ReadersAgreeScrollCue({ startReadingRef }: ReadersAgreeScrollCueProps) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  useEffect(() => {
    if (isSessionDismissed()) return;

    const target = startReadingRef.current;
    if (!target) return;

    const updateFromEntry = (entry: IntersectionObserverEntry | undefined) => {
      if (!entry || isSessionDismissed()) {
        setVisible(false);
        return;
      }
      const fullyVisible = entry.isIntersecting && entry.intersectionRatio >= 1;
      setVisible(!fullyVisible);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        updateFromEntry(entries[0]);
      },
      { threshold: [0, 1] },
    );
    observer.observe(target);

    let scrollDismissed = false;
    const onScroll = () => {
      if (scrollDismissed || isSessionDismissed()) return;
      if (window.scrollY < SCROLL_DISMISS_PX) return;
      scrollDismissed = true;
      markSessionDismissed();
      setFading(true);
      window.setTimeout(() => {
        setVisible(false);
        setFading(false);
      }, 300);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [startReadingRef]);

  if (!visible && !fading) return null;

  return (
    <div
      className={`ra-bn-more-below${fading ? ' ra-bn-more-below--fade' : ''}${
        reducedMotion ? '' : ' ra-bn-more-below--animate'
      }`}
      style={{ zIndex: CUE_Z_INDEX }}
      aria-hidden="true"
    >
      <span className="ra-bn-more-below-chevron">⌄</span>
      <span className="ra-bn-more-below-label">More Below</span>
    </div>
  );
}
