'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { readContestEmail } from '@/lib/identity';

const PLATFORM_CONFIG: Record<string, { title: string; action: string; pointsNote: string }> = {
  tt: {
    title: 'Claim Your TikTok Points',
    action: 'share_tiktok',
    pointsNote: 'Posted to TikTok? Tap below to claim your 100 points.',
  },
  ig: {
    title: 'Claim Your Instagram Points',
    action: 'share_instagram',
    pointsNote: 'Posted to Instagram? Tap below to claim your 100 points.',
  },
  truth: {
    title: 'Claim Your Truth Social Points',
    action: 'share_truth',
    pointsNote: 'Posted to Truth Social? Tap below to claim your 100 points.',
  },
  x: {
    title: 'Claim Your X Points',
    action: 'share_x',
    pointsNote: 'Posted to X? Tap below to claim your 100 points.',
  },
  fb: {
    title: 'Claim Your Facebook Points',
    action: 'share_fb',
    pointsNote: 'Posted to Facebook? Tap below to claim your 100 points.',
  },
};

function PostedContent() {
  const searchParams = useSearchParams();
  const platformParam = searchParams.get('platform') || 'tt';
  const platform = ['tt', 'ig', 'truth', 'x', 'fb'].includes(platformParam) ? platformParam : 'tt';
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.tt;

  const [awarding, setAwarding] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setAwarding(true);
    setError(null);
    const email = readContestEmail();
    if (!email) {
      setError('Please enter the contest first.');
      setAwarding(false);
      return;
    }
    try {
      const res = await fetch('/api/points/award', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': email,
        },
        body: JSON.stringify({
          action: config.action,
          source: 'posted_recovery',
          targetVariant: 'challenge',
          variant: 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setPointsAwarded(true);
      } else {
        throw new Error(data?.error || 'Failed to claim');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record your post. Please try again.');
    } finally {
      setAwarding(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        background: '#ffffff',
        color: '#1a1a1a',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem', textAlign: 'center' }}>
        {config.title}
      </h1>
      <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '2rem', textAlign: 'center', maxWidth: 320 }}>
        {config.pointsNote}
      </p>

      {error && (
        <p style={{ fontSize: '0.9rem', color: '#dc2626', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>
      )}

      <button
        type="button"
        onClick={handleClaim}
        disabled={awarding || pointsAwarded}
        style={{
          padding: '1.25rem 2rem',
          borderRadius: 12,
          border: 'none',
          background: pointsAwarded ? '#10b981' : awarding ? '#9ca3af' : 'linear-gradient(135deg, #ff0050 0%, #00f2ea 100%)',
          color: '#fff',
          fontSize: '1.25rem',
          fontWeight: 700,
          cursor: awarding || pointsAwarded ? 'not-allowed' : 'pointer',
          marginBottom: '1rem',
          touchAction: 'manipulation',
        }}
      >
        {awarding ? 'Claiming…' : pointsAwarded ? '✓ Points claimed!' : 'I Posted ✅ (Claim Points)'}
      </button>

      {pointsAwarded && (
        <Link
          href="/contest/score"
          style={{
            display: 'block',
            padding: '1rem 2rem',
            borderRadius: 12,
            border: '2px solid #1a1a1a',
            background: '#fff',
            color: '#1a1a1a',
            fontSize: '1.1rem',
            fontWeight: 600,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          Return to Scoreboard
        </Link>
      )}

      {!pointsAwarded && (
        <Link
          href="/contest/score"
          style={{
            fontSize: '0.9rem',
            color: '#6b7280',
            marginTop: '1rem',
            textDecoration: 'underline',
          }}
        >
          ← Back to Score
        </Link>
      )}
    </div>
  );
}

export default function PostedPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          minHeight: '100svh',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1a1a1a',
        }}>
          Loading…
        </div>
      }
    >
      <PostedContent />
    </Suspense>
  );
}
