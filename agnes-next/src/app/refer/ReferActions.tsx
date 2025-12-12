'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReferVideoId } from '@/config/referVideos';

interface ReferActionsProps {
  referralCode: string;
  videoId: ReferVideoId;
}

export default function ReferActions({ referralCode, videoId }: ReferActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!referralCode) return;

    try {
      // LocalStorage for easy access in other client components
      window.localStorage.setItem('referral_code', referralCode);

      // Simple cookie so API routes / server-side logic can read it later if needed
      document.cookie = `referral_code=${encodeURIComponent(
        referralCode
      )}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    } catch {
      // fail silently
    }
  }, [referralCode]);

  // Build query string preserving referral code and video params
  const buildCodeQuery = () => {
    const params = new URLSearchParams();
    if (referralCode) params.set('code', referralCode);
    params.set('v', videoId);
    params.set('src', 'email');
    return params.toString();
  };

  // 1. Get the Book – Save $3.90
  const handleGetTheBook = () => {
    const q = buildCodeQuery();
    router.push(`/sample-chapters?${q}`);
  };

  // 2. Sample the Book
  const handleSampleTheBook = () => {
    const q = buildCodeQuery();
    router.push(`/sample-chapters?${q}`);
  };

  // 3. Enter the Mystery
  const handleEnterMystery = () => {
    const params = new URLSearchParams();
    if (referralCode) params.set('code', referralCode);
    if (videoId) params.set('v', videoId);
    const source = searchParams.get('src');
    if (source) params.set('src', source);

    const qs = params.toString();
    router.push(qs ? `/lightening?${qs}` : '/lightening');
  };

  // 4. Win the Contest
  const handleWinContest = () => {
    // Jump straight to The Protocol Challenge page
    const q = buildCodeQuery();
    router.push(`/the-protocol-challenge?${q}`);
  };

  const buttonBaseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.375rem',
    border: '1px solid transparent',
    padding: '0.75rem 1.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.2s',
    cursor: 'pointer',
    width: '100%',
  };

  return (
    <>
      <style>{`
        @media (min-width: 768px) {
          .refer-actions-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {referralCode ? (
          <p style={{ fontSize: '0.75rem', color: '#666' }}>
            Referral code <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{referralCode}</span> is
            already applied. If you buy the book, your friend earns $2.
          </p>
        ) : (
          <p style={{ fontSize: '0.75rem', color: '#999' }}>
            No referral code detected. You can still play, but your purchase
            won&apos;t be credited to a friend.
          </p>
        )}

        <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#666', textAlign: 'left' }}>
          Choose how you want to jump in:
        </p>

        <div
          className="refer-actions-grid"
          style={{
            marginTop: '1rem',
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: '1fr',
            maxWidth: '36rem',
          }}
        >
        {/* Button 1 – Get the Book */}
        <button
          onClick={handleGetTheBook}
          style={{
            ...buttonBaseStyle,
            color: '#fff',
            backgroundColor: '#9333ea',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#7e22ce';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#9333ea';
          }}
        >
          Get the Book – Save $3.90
        </button>

        {/* Button 2 – Sample the Book */}
        <button
          onClick={handleSampleTheBook}
          style={{
            ...buttonBaseStyle,
            color: '#333',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f9fafb';
            e.currentTarget.style.borderColor = '#9ca3af';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
        >
          Sample the Book
        </button>

        {/* Button 3 – Enter the Mystery */}
        <button
          onClick={handleEnterMystery}
          style={{
            ...buttonBaseStyle,
            color: '#fff',
            backgroundColor: '#000',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1a1a1a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#000';
          }}
        >
          Enter the Mystery
        </button>

        {/* Button 4 – Win the Contest */}
        <button
          onClick={handleWinContest}
          style={{
            ...buttonBaseStyle,
            color: '#333',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e5e7eb';
            e.currentTarget.style.borderColor = '#9ca3af';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
        >
          Win the Contest
        </button>
      </div>
      </div>
    </>
  );
}

