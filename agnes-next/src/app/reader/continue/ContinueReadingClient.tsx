'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CHAPTERS } from '@/app/sample-chapters/chapters';
import { CONTINUE_READING_COPY } from '@/config/jodyMobileDeliveryCopy';
import { jodyEm2PortraitCropStyle } from '@/config/jodyPortraitStyle';
import { getNextChapterId } from '@/config/jodyConcierge';
import { resolveChapterContinueToken } from '@/lib/jodyMobileDeliveryApi';
import { contestLoginWithEmail } from '@/lib/jodyConciergeApi';
import { writeContestEmail } from '@/lib/identity';
import { markReaderKnown } from '@/lib/readerStatus';
import { BuyBookButton } from '@/components/BuyBookButton';
import {
  AMAZON_REVIEWS_URL,
  BARNES_NOBLE_REVIEWS_URL,
} from '@/lib/metaAdLanding';

const JODY_ICON = '/jody-icons/jody-em2.png';
const sansFont = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; chapterId: string; email: string };

const cardStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '16px 18px',
  borderRadius: 12,
  textDecoration: 'none',
  fontFamily: sansFont,
  fontSize: 15,
  fontWeight: 600,
  textAlign: 'center',
};

export default function ContinueReadingClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: CONTINUE_READING_COPY.errorInvalidLink });
      return;
    }

    let cancelled = false;

    async function run() {
      const result = await resolveChapterContinueToken(token!);
      if (cancelled) return;

      if (!result.ok || !result.data) {
        setState({ status: 'error', message: CONTINUE_READING_COPY.errorInvalidLink });
        return;
      }

      writeContestEmail(result.data.email);
      markReaderKnown();
      await contestLoginWithEmail(result.data.email);

      setState({
        status: 'ready',
        chapterId: result.data.chapterId,
        email: result.data.email,
      });
    }

    run().catch(() => {
      if (!cancelled) {
        setState({ status: 'error', message: CONTINUE_READING_COPY.errorGeneric });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === 'loading') {
    return (
      <Shell>
        <p style={{ fontFamily: sansFont, color: '#c8f5ef' }}>One moment…</p>
      </Shell>
    );
  }

  if (state.status === 'error') {
    return (
      <Shell>
        <p style={{ fontFamily: sansFont, color: '#ffb4b4', lineHeight: 1.6 }}>{state.message}</p>
        <Link href="/sample-chapters" style={{ color: '#00ffe5', marginTop: 16 }}>
          ← Sample Chapters
        </Link>
      </Shell>
    );
  }

  const nextChapterId = getNextChapterId(state.chapterId);
  const nextChapter = nextChapterId ? CHAPTERS[nextChapterId] : null;

  const buyStyle: React.CSSProperties = {
    ...cardStyle,
    background: '#00ffe5',
    color: '#001a18',
    border: 'none',
    boxShadow: '0 4px 16px rgba(0, 255, 229, 0.25)',
  };

  const primaryStyle: React.CSSProperties = {
    ...cardStyle,
    background: 'rgba(0, 255, 229, 0.12)',
    color: '#00ffe5',
    border: '1px solid rgba(0, 255, 229, 0.55)',
  };

  const secondaryStyle: React.CSSProperties = {
    ...cardStyle,
    background: 'transparent',
    color: '#00ffe5',
    border: '1px solid rgba(0, 255, 229, 0.35)',
    fontWeight: 500,
  };

  return (
    <Shell>
      <img
        src={JODY_ICON}
        alt="Jody"
        width={80}
        height={80}
        style={{
          ...jodyEm2PortraitCropStyle,
          borderRadius: '50%',
          border: '2px solid rgba(0, 255, 229, 0.45)',
          marginBottom: 12,
        }}
      />
      <div style={{ fontFamily: sansFont, color: '#e6fffb', marginBottom: 20, textAlign: 'center' }}>
        {CONTINUE_READING_COPY.welcome.map((line) => (
          <p key={line} style={{ margin: '0 0 6px', fontSize: 15, lineHeight: 1.5 }}>
            {line}
          </p>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BuyBookButton source="jody-continue-reading" style={buyStyle}>
          {CONTINUE_READING_COPY.buyLabel}
        </BuyBookButton>

        {nextChapter && nextChapterId && (
          <Link href={`/sample-chapters/read/${nextChapterId}`} style={primaryStyle}>
            {CONTINUE_READING_COPY.continueLabel} — {nextChapter.title}
          </Link>
        )}

        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(0, 255, 229, 0.65)',
            fontFamily: sansFont,
            textAlign: 'center',
          }}
        >
          {CONTINUE_READING_COPY.chaptersHeading}
        </p>

        {Object.entries(CHAPTERS).map(([id, ch]) => (
          <Link
            key={id}
            href={`/sample-chapters/read/${id}`}
            style={{
              ...secondaryStyle,
              opacity: id === state.chapterId ? 0.85 : 1,
            }}
          >
            {ch.title}
            {id === state.chapterId ? ' (current)' : ''}
          </Link>
        ))}

        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(0, 255, 229, 0.65)',
            fontFamily: sansFont,
            textAlign: 'center',
          }}
        >
          {CONTINUE_READING_COPY.reviewsHeading}
        </p>

        <a href={AMAZON_REVIEWS_URL} target="_blank" rel="noopener noreferrer" style={secondaryStyle}>
          {CONTINUE_READING_COPY.amazonLabel}
        </a>
        <a
          href={BARNES_NOBLE_REVIEWS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={secondaryStyle}
        >
          {CONTINUE_READING_COPY.bnLabel}
        </a>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        backgroundColor: '#000',
        color: '#00ffe5',
        fontFamily: '"Courier New", Courier, monospace',
        padding:
          'max(20px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
      }}
    >
      {children}
    </div>
  );
}
