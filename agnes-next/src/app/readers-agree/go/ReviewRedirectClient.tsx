'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isMobileTouchBrowser } from '@/lib/device';
import { isReadersAgreeDorothyBridgeEnabled } from '@/lib/funnelConfig';
import {
  buildReadersAgreePathWithTracking,
  READERS_AGREE_CATALOG_PATH,
  READERS_AGREE_PATH,
  SAMPLE_CHAPTERS_PATH,
} from '@/lib/readerRecommendationLanding';
import {
  clearRetailerPopupBlocked,
  getReadersAgreeMomentumSnapshot,
  isRetailerPopupBlocked,
  markBridgeDepartedIfCurrentlyHidden,
  markBridgeTabDeparted,
  markReadersAgreeReviewOpened,
  READERS_AGREE_MOMENTUM_STORAGE_KEYS,
  tryPromoteReadersAgreeContinuation,
} from '@/lib/readersAgreeMomentum';
import { FUNNEL_EVENT_TYPES, trackFunnelEvent, type FunnelEventType } from '@/lib/funnelTracking';

const REDIRECT_DELAY_MS = 2500;
const BRIDGE_ENABLED = isReadersAgreeDorothyBridgeEnabled();

function subscribeNoop() {
  return () => {};
}

function isBackForwardNavigation(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === 'back_forward';
}

type ReviewRedirectClientProps = {
  heading: string;
  destinationUrl: string;
  retailerLabel: string;
};

const shellStyle = {
  minHeight: '100vh',
  background: '#050505',
  color: '#f5f5f5',
  display: 'flex',
  flexDirection: 'column',
} as const;

const sectionStyle = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 20px',
  background:
    'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(185, 28, 28, 0.35) 0%, transparent 55%), linear-gradient(180deg, #0c0c0c 0%, #050505 100%)',
} as const;

const panelStyle = {
  width: '100%',
  maxWidth: '28rem',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '20px',
} as const;

const quietLinkStyle = {
  fontSize: '14px',
  color: 'rgba(245, 245, 245, 0.55)',
  textDecoration: 'underline',
  padding: '4px 0',
} as const;

const bridgeActionCtaStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '14px 20px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 700,
  border: '1px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#fff',
  textDecoration: 'none',
  width: '100%',
} as const;

const retailerBridgeCtaStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '14px 20px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 700,
  border: '1px solid rgba(220, 38, 38, 0.55)',
  background: 'rgba(220, 38, 38, 0.18)',
  color: '#fff',
  textDecoration: 'none',
  width: '100%',
} as const;

function retailerClickEventType(label: string): FunnelEventType {
  return label === 'Barnes & Noble'
    ? FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK
    : FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK;
}

function LegacyReviewRedirectClient({ heading, destinationUrl }: ReviewRedirectClientProps) {
  const searchParams = useSearchParams();
  const [showSpinner, setShowSpinner] = useState(true);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const readersAgreeHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_PATH, searchParams),
    [searchParams]
  );

  const cancelRedirect = useCallback(() => {
    cancelledRef.current = true;
    setShowSpinner(false);
    if (redirectTimerRef.current !== null) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    setShowSpinner(true);

    if (isBackForwardNavigation()) {
      cancelRedirect();
      return;
    }

    redirectTimerRef.current = setTimeout(() => {
      if (cancelledRef.current) return;
      window.location.assign(destinationUrl);
    }, REDIRECT_DELAY_MS);

    return () => {
      if (redirectTimerRef.current !== null) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [destinationUrl, cancelRedirect]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || isBackForwardNavigation()) {
        cancelRedirect();
      }
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [cancelRedirect]);

  return (
    <main style={shellStyle}>
      <section style={sectionStyle}>
        <div style={panelStyle}>
          {showSpinner && (
            <div
              aria-hidden
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '3px solid rgba(255, 255, 255, 0.12)',
                borderTopColor: '#ef4444',
                animation: 'rrfRedirectSpin 0.9s linear infinite',
              }}
            />
          )}

          <div>
            <h1
              style={{
                margin: '0 0 12px 0',
                fontSize: 'clamp(1.35rem, 4vw, 1.75rem)',
                fontWeight: 800,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              {heading}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: '16px',
                lineHeight: 1.65,
                color: 'rgba(245, 245, 245, 0.72)',
              }}
            >
              Please wait while we take you directly to The Agnes Protocol review page.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              width: '100%',
              maxWidth: '20rem',
            }}
          >
            <a
              href={destinationUrl}
              style={{
                fontSize: '14px',
                color: 'rgba(245, 245, 245, 0.65)',
                textDecoration: 'underline',
              }}
            >
              Continue manually
            </a>

            <Link
              href={readersAgreeHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 20px',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 700,
                border: '1px solid rgba(255, 255, 255, 0.25)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              Back to Reader Recommendation Page
            </Link>
          </div>
        </div>
      </section>

      <style jsx global>{`
        @keyframes rrfRedirectSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}

function BridgeReviewRedirectClient({ destinationUrl, retailerLabel }: ReviewRedirectClientProps) {
  const searchParams = useSearchParams();
  const mobileTwoTap = useSyncExternalStore(subscribeNoop, isMobileTouchBrowser, () => false);
  const [continuationActive, setContinuationActive] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [reviewValidated, setReviewValidated] = useState(false);
  const ignoreFocusUntilRef = useRef(Date.now() + 300);
  const continuationFallbackRef = useRef<number | null>(null);

  const readersAgreeHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_PATH, searchParams),
    [searchParams]
  );

  const sampleChaptersHref = useMemo(
    () => buildReadersAgreePathWithTracking(SAMPLE_CHAPTERS_PATH, searchParams),
    [searchParams]
  );

  const catalogHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_CATALOG_PATH, searchParams),
    [searchParams]
  );

  const retailerClickType = useMemo(
    () => retailerClickEventType(retailerLabel),
    [retailerLabel]
  );

  const applyContinuationIfReady = useCallback(() => {
    if (tryPromoteReadersAgreeContinuation()) {
      setContinuationActive(true);
      clearRetailerPopupBlocked();
      setPopupBlocked(false);
      setReviewValidated(false);
      if (continuationFallbackRef.current) {
        clearTimeout(continuationFallbackRef.current);
        continuationFallbackRef.current = null;
      }
      return true;
    }
    const snapshot = getReadersAgreeMomentumSnapshot();
    if (snapshot.active) {
      setContinuationActive(true);
      setReviewValidated(false);
      if (continuationFallbackRef.current) {
        clearTimeout(continuationFallbackRef.current);
        continuationFallbackRef.current = null;
      }
      return true;
    }
    setReviewValidated(snapshot.validated);
    return false;
  }, []);

  const scheduleContinuationFallback = useCallback(() => {
    if (continuationFallbackRef.current) return;
    continuationFallbackRef.current = window.setTimeout(() => {
      continuationFallbackRef.current = null;
      const snapshot = getReadersAgreeMomentumSnapshot();
      if (snapshot.active) return;
      if (!snapshot.validated) return;
      markBridgeTabDeparted();
      applyContinuationIfReady();
    }, REDIRECT_DELAY_MS);
  }, [applyContinuationIfReady]);

  const rehydrateMomentumState = useCallback(() => {
    applyContinuationIfReady();
  }, [applyContinuationIfReady]);

  useEffect(() => {
    markBridgeDepartedIfCurrentlyHidden();
    setPopupBlocked(isRetailerPopupBlocked());
    rehydrateMomentumState();
    if (getReadersAgreeMomentumSnapshot().validated) {
      scheduleContinuationFallback();
    }

    return () => {
      if (continuationFallbackRef.current) {
        clearTimeout(continuationFallbackRef.current);
        continuationFallbackRef.current = null;
      }
    };
  }, [rehydrateMomentumState, scheduleContinuationFallback]);

  useEffect(() => {
    const markDeparted = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        markBridgeTabDeparted();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markDeparted();
        return;
      }
      rehydrateMomentumState();
    };

    const onPageHide = () => markBridgeTabDeparted();

    const onPageShow = () => {
      markBridgeDepartedIfCurrentlyHidden();
      rehydrateMomentumState();
    };

    const onWindowBlur = () => markDeparted();

    const onWindowFocus = () => {
      if (Date.now() < ignoreFocusUntilRef.current) {
        rehydrateMomentumState();
        return;
      }
      if (getReadersAgreeMomentumSnapshot().validated) {
        markBridgeTabDeparted();
      }
      rehydrateMomentumState();
    };

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === READERS_AGREE_MOMENTUM_STORAGE_KEYS.validated ||
        event.key === READERS_AGREE_MOMENTUM_STORAGE_KEYS.departed ||
        event.key === READERS_AGREE_MOMENTUM_STORAGE_KEYS.active
      ) {
        rehydrateMomentumState();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('storage', onStorage);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [rehydrateMomentumState]);

  const handleBridgeRetailerClick = () => {
    markReadersAgreeReviewOpened();
    setReviewValidated(true);
    scheduleContinuationFallback();
    trackFunnelEvent(retailerClickType, {}, {
      source: 'readers-agree-bridge',
      searchParams,
    });
    window.setTimeout(() => {
      if (!document.hasFocus()) {
        markBridgeTabDeparted();
      }
    }, 0);
  };

  const handleQuietRetailerOpen = () => {
    markReadersAgreeReviewOpened();
    window.open(destinationUrl, '_blank', 'noopener,noreferrer');
    clearRetailerPopupBlocked();
    setPopupBlocked(false);
    window.setTimeout(() => {
      if (!document.hasFocus()) {
        markBridgeTabDeparted();
      }
    }, 0);
  };

  const handleBuyClick = () => {
    trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK, {}, {
      source: 'readers-agree-bridge',
      searchParams,
    });
  };

  const handleSampleClick = () => {
    trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK, {}, {
      source: 'readers-agree-bridge',
      searchParams,
    });
  };

  const actionColumnStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    width: '100%',
    maxWidth: '20rem',
  };

  const showMobileRetailerAction = mobileTwoTap && !reviewValidated && !continuationActive;
  const showPopupBlockedFallback =
    popupBlocked && !continuationActive && !mobileTwoTap;

  if (continuationActive) {
    return (
      <main style={shellStyle}>
        <section style={sectionStyle}>
          <div style={panelStyle}>
            <div>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: 'clamp(1.35rem, 4vw, 1.75rem)',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                }}
              >
                Ready to see for yourself?
              </h1>
            </div>

            <div style={actionColumnStyle}>
              <Link href={catalogHref} onClick={handleBuyClick} style={bridgeActionCtaStyle}>
                Buy the Book
              </Link>

              <Link href={sampleChaptersHref} onClick={handleSampleClick} style={bridgeActionCtaStyle}>
                Read Sample Chapters
              </Link>

              <a
                href={destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...quietLinkStyle,
                  display: 'inline',
                }}
              >
                Want another look at {retailerLabel}?
              </a>

              <Link href={readersAgreeHref} style={quietLinkStyle}>
                Back
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={shellStyle}>
      <section style={sectionStyle}>
        <div style={panelStyle}>
          <div>
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: 'clamp(1.35rem, 4vw, 1.75rem)',
                fontWeight: 800,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              {retailerLabel} reviews
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: '16px',
                lineHeight: 1.5,
                color: 'rgba(245, 245, 245, 0.72)',
              }}
            >
              {showMobileRetailerAction
                ? 'Opens in a new tab.'
                : showPopupBlockedFallback
                  ? 'Your browser may have blocked the review window.'
                  : 'Opened in a new tab.'}
            </p>
          </div>

          <div style={actionColumnStyle}>
            {showMobileRetailerAction && (
              <a
                href={destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleBridgeRetailerClick}
                style={retailerBridgeCtaStyle}
              >
                Open {retailerLabel} reviews
              </a>
            )}

            {showPopupBlockedFallback && (
              <button
                type="button"
                onClick={handleQuietRetailerOpen}
                style={{
                  ...quietLinkStyle,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                Open {retailerLabel} reviews
              </button>
            )}

            <Link href={readersAgreeHref} style={quietLinkStyle}>
              Back
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ReviewRedirectClient(props: ReviewRedirectClientProps) {
  if (BRIDGE_ENABLED) {
    return <BridgeReviewRedirectClient {...props} />;
  }
  return <LegacyReviewRedirectClient {...props} />;
}
