'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isReadersAgreeDorothyBridgeEnabled } from '@/lib/funnelConfig';
import {
  buildReadersAgreePathWithTracking,
  READERS_AGREE_PATH,
  SAMPLE_CHAPTERS_PATH,
} from '@/lib/readerRecommendationLanding';
import { markReadersAgreeReviewOpened } from '@/lib/readersAgreeMomentum';

const REDIRECT_DELAY_MS = 2500;
const BRIDGE_ENABLED = isReadersAgreeDorothyBridgeEnabled();

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

  const readersAgreeHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_PATH, searchParams),
    [searchParams]
  );

  const sampleChaptersHref = useMemo(
    () => buildReadersAgreePathWithTracking(SAMPLE_CHAPTERS_PATH, searchParams),
    [searchParams]
  );

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
              Opens in a new tab.
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
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={() => markReadersAgreeReviewOpened()}
              style={{
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
              }}
            >
              Open {retailerLabel} reviews
            </a>

            <Link
              href={sampleChaptersHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px 20px',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 700,
                border: '1px solid rgba(0, 255, 127, 0.35)',
                background: 'rgba(0, 255, 127, 0.08)',
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              Read 4 free sample chapters
            </Link>

            <Link
              href={readersAgreeHref}
              style={{
                fontSize: '14px',
                color: 'rgba(245, 245, 245, 0.55)',
                textDecoration: 'underline',
                padding: '4px 0',
              }}
            >
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
