'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { getChapterWelcomeCopy } from '@/config/jodyMobileDeliveryCopy';
import { requestChapterDelivery } from '@/lib/jodyMobileDeliveryApi';
import { writeContestEmail } from '@/lib/identity';
import { markReaderKnown } from '@/lib/readerStatus';

const JODY_ICON = '/jody-icons/jody-em2.png';

type MobileChapterLandingProps = {
  chapterId: string;
  title: string;
  pdfUrl: string;
};

const pageFont = '"Courier New", Courier, monospace';
const sansFont = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function MobileChapterLanding({ chapterId, title, pdfUrl }: MobileChapterLandingProps) {
  const copy = getChapterWelcomeCopy(title);
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'form' | 'sent'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError(copy.errorInvalidEmail);
      return;
    }

    setSubmitting(true);
    const result = await requestChapterDelivery(trimmed, chapterId);
    setSubmitting(false);

    if (!result.ok) {
      setError(copy.errorGeneric);
      return;
    }

    writeContestEmail(trimmed);
    markReaderKnown();
    setPhase('sent');
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
        color: '#00ffe5',
        fontFamily: pageFont,
        padding:
          'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
      }}
    >
      <Link
        href="/sample-chapters"
        style={{
          color: '#00ffe5',
          fontSize: 14,
          textDecoration: 'underline',
          marginBottom: 20,
          alignSelf: 'flex-start',
        }}
      >
        ← Sample Chapters
      </Link>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
        <img
          src={JODY_ICON}
          alt="Jody"
          width={96}
          height={96}
          style={{
            borderRadius: '50%',
            border: '2px solid rgba(0, 255, 229, 0.45)',
            marginBottom: 16,
          }}
        />

        <div
          style={{
            maxWidth: 400,
            width: '100%',
            fontFamily: sansFont,
            background: 'linear-gradient(146deg, rgba(0, 120, 110, 0.92), rgba(0, 70, 85, 0.95))',
            border: '1px solid rgba(0, 255, 229, 0.35)',
            borderRadius: 16,
            padding: '20px 18px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
            color: '#e6fffb',
          }}
        >
          {phase === 'form' ? (
            <>
              {copy.greeting.map((line) => (
                <p key={line} style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.5 }}>
                  {line}
                </p>
              ))}
              {copy.intro.map((line) => (
                <p
                  key={line}
                  style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: '#c8f5ef' }}
                >
                  {line}
                </p>
              ))}

              <ul
                style={{
                  margin: '16px 0 0',
                  paddingLeft: 18,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: '#b8fff8',
                }}
              >
                {copy.benefits.map((item) => (
                  <li key={item} style={{ marginBottom: 6 }}>
                    {item}
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(0, 255, 229, 0.4)',
                    background: 'rgba(0, 0, 0, 0.35)',
                    color: '#fff',
                    fontSize: 16,
                    marginBottom: 12,
                  }}
                />
                {error && (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#ffb4b4' }}>{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    borderRadius: 999,
                    border: 'none',
                    background: '#00ffe5',
                    color: '#001a18',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? copy.emailSubmitting : copy.emailLabel}
                </button>
              </form>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{copy.emailSentTitle}</p>
              {copy.emailSentBody.map((line) => (
                <p
                  key={line}
                  style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: '#c8f5ef' }}
                >
                  {line}
                </p>
              ))}
            </>
          )}
        </div>

        {phase === 'form' && (
          <div style={{ marginTop: 20, textAlign: 'center', maxWidth: 400 }}>
            <button
              type="button"
              onClick={() => setShowFallback((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(0, 255, 229, 0.75)',
                fontSize: 13,
                textDecoration: 'underline',
                cursor: 'pointer',
                fontFamily: sansFont,
              }}
            >
              {copy.readHereLink}
            </button>
            {showFallback && (
              <div style={{ marginTop: 14, fontFamily: sansFont }}>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0, 255, 229, 0.7)' }}>
                  {copy.readHereHint}
                </p>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: 10,
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: '1px solid rgba(0, 255, 229, 0.5)',
                    color: '#00ffe5',
                    textDecoration: 'none',
                    fontSize: 14,
                  }}
                >
                  Open {title}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
