'use client';

import { useEffect, useState } from 'react';

export type GuidanceStep = 'tapTikTokInMenu' | 'pasteCaptionInTikTok';

const STEP_TEXT: Record<GuidanceStep, string> = {
  tapTikTokInMenu: 'Now tap TikTok in the share sheet',
  pasteCaptionInTikTok: 'In TikTok: press & hold → Paste → Next → Post',
};

export interface GuidanceOverlayProps {
  step: GuidanceStep;
  isVisible: boolean;
  onDismiss?: () => void;
  /** Instructional content never auto-dismisses. User must tap "Got it". */
}

export function GuidanceOverlay({
  step,
  isVisible,
  onDismiss,
}: GuidanceOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // No timer-based auto-dismiss. Instructional content stays until user taps "Got it".

  if (!isVisible || !mounted) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        animation: 'guidanceFadeIn 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes guidanceFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes guidancePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
      `}</style>

      {/* Animated arrow/pulse */}
      <div
        style={{
          marginBottom: 16,
          fontSize: 48,
          animation: 'guidancePulse 1.2s ease-in-out infinite',
        }}
      >
        👆
      </div>

      <p
        style={{
          color: '#fff',
          fontSize: '1.125rem',
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: 320,
          lineHeight: 1.4,
        }}
      >
        {STEP_TEXT[step]}
      </p>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginTop: 20,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.9)',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          Got it
        </button>
      )}
    </div>
  );
}
