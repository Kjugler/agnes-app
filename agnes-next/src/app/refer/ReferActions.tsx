'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { ReferVideoId } from '@/config/referVideos';

interface ReferActionsProps {
  referralCode: string;
  videoId: ReferVideoId;
}

export default function ReferActions({ referralCode, videoId }: ReferActionsProps) {
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

  // Build link into the contest / purchase funnel.
  // Adjust path + param names to match your existing entry page.
  const baseHref = '/contest'; // Main contest/landing route
  const href =
    referralCode
      ? `${baseHref}?ref=${encodeURIComponent(referralCode)}&v=${videoId}`
      : baseHref;

  return (
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

      <div>
        <Link
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '0.375rem',
            border: '1px solid transparent',
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#fff',
            backgroundColor: '#000',
            textDecoration: 'none',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1a1a1a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#000';
          }}
        >
          Start the Game
        </Link>
      </div>
    </div>
  );
}

