'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { writeContestEmail } from '@/lib/identity';
import {
  buildSampleChaptersShareUrl,
  buildScoreTextAFriendSmsBody,
  openScoreTextAFriendSms,
} from '@/lib/textAFriendScore';

function isMobileSmsDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.875rem 1.5rem',
  fontSize: '1rem',
  fontWeight: 700,
  borderRadius: 9999,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  maxWidth: 320,
  color: '#fff',
  background: 'linear-gradient(to right, #e11d48, #be123c)',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  fontWeight: 600,
  fontSize: '0.875rem',
  padding: '0.65rem 1.25rem',
  maxWidth: '100%',
  background: '#f3f4f6',
  color: '#1a1a1a',
  border: '1px solid #d1d5db',
};

export default function TextAFriendLandingClient() {
  const searchParams = useSearchParams();
  const refCode = useMemo(() => searchParams.get('ref')?.trim() || '', [searchParams]);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const smsBody = useMemo(
    () => (refCode ? buildScoreTextAFriendSmsBody(refCode) : ''),
    [refCode]
  );
  const sampleChaptersUrl = useMemo(
    () => (refCode ? buildSampleChaptersShareUrl(refCode) : ''),
    [refCode]
  );

  useEffect(() => {
    setMounted(true);
    setIsMobile(isMobileSmsDevice());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const emailFromQuery = searchParams.get('email');
    if (!emailFromQuery) return;

    const normalizedEmail = emailFromQuery.trim().toLowerCase();
    if (!normalizedEmail) return;

    writeContestEmail(normalizedEmail);
    const baseUrl = window.location.origin;

    fetch(`${baseUrl}/api/contest/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
      credentials: 'include',
    }).catch(() => {});
  }, [searchParams]);

  const showCopyFeedback = useCallback((label: string) => {
    setCopyFeedback(label);
    window.setTimeout(() => setCopyFeedback(null), 2500);
  }, []);

  const copyText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showCopyFeedback(label);
      } catch {
        showCopyFeedback('Copy failed — select and copy manually');
      }
    },
    [showCopyFeedback]
  );

  const handleTextAFriend = useCallback(() => {
    openScoreTextAFriendSms(refCode);
  }, [refCode]);

  if (!refCode) {
    return (
      <div
        style={{
          padding: '1rem',
          borderRadius: 8,
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: 15,
          lineHeight: 1.5,
        }}
      >
        <p style={{ margin: 0 }}>
          This link needs your personal reader code. Open the link from your email, or visit{' '}
          <a href="/contest/score" style={{ color: '#b91c1c', fontWeight: 600 }}>
            Reader Sharing Tools
          </a>{' '}
          to get your link.
        </p>
      </div>
    );
  }

  if (!mounted) {
    return <p style={{ fontSize: 14, color: '#64748b' }}>Loading…</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
          <button type="button" onClick={handleTextAFriend} style={buttonStyle}>
            Text a Friend
          </button>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Opens your messaging app with a ready-to-send recommendation and your sample-chapters
            link.
          </p>
        </div>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
            Text messaging works best on your phone. On desktop, copy the message below — or open
            this page on your phone and tap Text a Friend.
          </p>

          <div>
            <label
              htmlFor="taf-message-preview"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Message preview
            </label>
            <textarea
              id="taf-message-preview"
              readOnly
              value={smsBody}
              rows={12}
              spellCheck={false}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: 14,
                lineHeight: 1.5,
                padding: '0.75rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontFamily: 'system-ui, sans-serif',
                resize: 'vertical',
                backgroundColor: '#f9fafb',
                color: '#1a1a1a',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={() => copyText(smsBody, 'Message copied')}
              style={secondaryButtonStyle}
            >
              Copy Message
            </button>
            <button
              type="button"
              onClick={() => copyText(sampleChaptersUrl, 'Link copied')}
              style={secondaryButtonStyle}
            >
              Copy Sample Chapters Link
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: '#64748b', wordBreak: 'break-all' }}>
            <a href={sampleChaptersUrl} style={{ color: '#2563eb' }}>
              {sampleChaptersUrl}
            </a>
          </p>

          <button type="button" onClick={handleTextAFriend} style={{ ...buttonStyle, maxWidth: '100%' }}>
            Text a Friend
          </button>
        </>
      )}

      {copyFeedback && (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 13,
            color: '#059669',
            fontWeight: 600,
          }}
        >
          {copyFeedback}
        </p>
      )}
    </div>
  );
}
