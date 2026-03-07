'use client';

import '../../styles/share.css';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SharePlatform } from '@/lib/shareAssets';
import { readContestEmail } from '@/lib/identity';
import type { ShareTarget } from '@/lib/shareTarget';

const ACTION_MAP: Record<SharePlatform, string> = {
  fb: 'share_fb',
  ig: 'share_ig',
  x: 'share_x',
  tt: 'share_tiktok',
  truth: 'share_truth',
};

export interface ShareScaffoldProps {
  platform: SharePlatform;
  variant: 1 | 2 | 3;
  target?: ShareTarget;
  children: React.ReactNode;
  /** Optional: hide the I Shared button (platform handles it differently) */
  hideIShared?: boolean;
  /** Optional: run before navigating back to score (e.g. award back bonus) */
  onBackToScore?: () => Promise<void>;
  /** Optional: small hint text below I Shared button */
  iSharedHint?: string;
}

export function ShareScaffold({
  platform,
  variant,
  target = 'challenge',
  children,
  hideIShared = false,
  onBackToScore,
  iSharedHint,
}: ShareScaffoldProps) {
  const router = useRouter();
  const [awardingPoints, setAwardingPoints] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);

  const handleIShared = async () => {
    if (pointsAwarded) return;

    setAwardingPoints(true);
    const email = readContestEmail();

    if (!email) {
      console.warn('[ShareScaffold] No email found, cannot award points');
      setAwardingPoints(false);
      return;
    }

    const action = ACTION_MAP[platform];

    try {
      const res = await fetch('/api/points/award', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': email,
        },
        body: JSON.stringify({
          action,
          source: 'share_page',
          targetVariant: target,
          variant,
        }),
      });

      if (res.ok) {
        setPointsAwarded(true);
        if (window.opener) {
          window.opener.postMessage({ type: 'points_awarded', action }, '*');
        }
        router.push('/contest/score');
      }
    } catch (err) {
      console.error('[ShareScaffold] Failed to award points', err);
      alert('Failed to record your share. Please try again.');
    } finally {
      setAwardingPoints(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Top pinned nav */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
          paddingBottom: 12,
          background: 'rgba(4, 7, 19, 0.95)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={async () => {
            await onBackToScore?.();
            router.push('/contest/score');
          }}
          className="share-tap-target"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background: 'rgba(15, 23, 42, 0.8)',
            color: '#e2e8f0',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          ← Back to Score
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="share-tap-target"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid rgba(148, 163, 184, 0.3)',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          Return to The Agnes Protocol
        </button>
      </div>

      {/* Scrollable content area - platform instructions */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '1rem',
          paddingTop: 'max(4.5rem, calc(56px + env(safe-area-inset-top)))',
          paddingBottom: hideIShared ? '2rem' : 'max(100px, calc(80px + env(safe-area-inset-bottom)))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {children}
      </div>

      {/* Bottom I Shared button - fixed on mobile */}
      {!hideIShared && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 90,
            padding: '12px 16px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            paddingLeft: 'max(16px, env(safe-area-inset-left))',
            paddingRight: 'max(16px, env(safe-area-inset-right))',
            background: 'rgba(4, 7, 19, 0.95)',
            borderTop: '1px solid rgba(148, 163, 184, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleIShared}
            disabled={awardingPoints || pointsAwarded}
            className="share-tap-target"
            style={{
              width: '100%',
              maxWidth: 320,
              padding: '14px 24px',
              borderRadius: 12,
              border: 'none',
              background: pointsAwarded ? '#10b981' : awardingPoints ? '#64748b' : '#3b82f6',
              color: 'white',
              fontSize: '1.1rem',
              fontWeight: 700,
              cursor: awardingPoints || pointsAwarded ? 'not-allowed' : 'pointer',
              minHeight: 48,
              touchAction: 'manipulation',
            }}
          >
            {awardingPoints ? 'Awarding...' : pointsAwarded ? '✓ Shared!' : '✅ I Shared'}
          </button>
          {iSharedHint && (
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
              {iSharedHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
