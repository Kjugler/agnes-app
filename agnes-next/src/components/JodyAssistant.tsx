'use client';

import React, { useEffect, useState } from 'react';
import { getTrainingVideoUrl } from '@/config/trainingVideos';

export type JodyVariant =
  | 'em1'
  | 'em2'
  | 'fb'
  | 'ig'
  | 'tiktok'
  | 'truth'
  | 'ascension';

interface JodyAssistantProps {
  variant: JodyVariant;
  message?: string | React.ReactNode; // Optional for IG/TikTok variants
  autoShowDelayMs?: number;
  defaultOpen?: boolean;
  onShowTraining?: () => void; // Callback to open training modal
  disableBubble?: boolean; // don't show any bubble if disabled
  /** When true, use mobile share layout: bubble non-blocking, safe positioning. No auto-collapse. */
  isSharePage?: boolean;
}

// ICON_MAP: All paths MUST start with leading slash for Vite/Next.js to resolve correctly
const ICON_MAP: Record<JodyVariant, string> = {
  em1: '/jody-icons/jody-em1.png',
  em2: '/jody-icons/jody-em2.png',
  fb: '/jody-icons/jody-fb.png',
  ig: '/jody-icons/jody-ig.png',
  tiktok: '/jody-icons/jody-tiktok.png',
  truth: '/jody-icons/jody-truth.png',
  ascension: '/jody-icons/jody-ascension.png',
};

export function JodyAssistant({
  variant,
  message,
  autoShowDelayMs = 4000,
  defaultOpen = false,
  onShowTraining,
  disableBubble = false,
  isSharePage = false,
}: JodyAssistantProps) {
  const [showBubble, setShowBubble] = useState(defaultOpen);
  const [showTraining, setShowTraining] = useState(false);
  const [hasAutoShown, setHasAutoShown] = useState(false);
  const [showXSteps, setShowXSteps] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Simple auto-show for the IG, TikTok, Truth, Ascension, and em2 (X) variants
  // On share pages: never auto-show — localStorage controls open/collapsed (user preference)
  useEffect(() => {
    // Don't auto-show if bubble is disabled
    if (disableBubble) return;
    // On share pages, localStorage + user controls state; no timer-based behavior
    if (isSharePage) return;

    const shouldAutoShow =
      variant === 'ig' ||
      variant === 'tiktok' ||
      variant === 'truth' ||
      variant === 'ascension' ||
      variant === 'em2';

    if (shouldAutoShow) {
      const timer = setTimeout(() => {
        setShowBubble(true);
        setHasAutoShown(true);
      }, autoShowDelayMs);

      return () => clearTimeout(timer);
    } else if (autoShowDelayMs && !hasAutoShown && !defaultOpen) {
      // For other variants, use existing behavior
      const timer = setTimeout(() => {
        setShowBubble(true);
        setHasAutoShown(true);
      }, autoShowDelayMs);

      return () => clearTimeout(timer);
    }
  }, [variant, autoShowDelayMs, hasAutoShown, defaultOpen, disableBubble, isSharePage, isMobile]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const useMobileShareLayout = isSharePage && isMobile;

  // Mobile share: NO auto-collapse. User closes via X only. Persist collapsed state.
  // First visit = OPEN. After user collapses once = COLLAPSED on future visits.
  const storageKey = typeof window !== 'undefined' ? `dq_share_${variant}_help` : 'dq_share_help';
  useEffect(() => {
    if (!isSharePage || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(storageKey);
      setShowBubble(saved !== 'collapsed'); // open on first visit, collapsed only if user chose that
    } catch {}
  }, [isSharePage, storageKey, variant]);

  const handleCloseBubble = () => {
    setShowBubble(false);
    try {
      localStorage.setItem(storageKey, 'collapsed');
    } catch {}
  };
  const onBubbleClose = isSharePage ? handleCloseBubble : () => setShowBubble(false);

  let iconSrc = ICON_MAP[variant];
  // Ensure path always starts with leading slash (defensive check)
  if (iconSrc && !iconSrc.startsWith('/')) {
    iconSrc = '/' + iconSrc;
  }

  const iconSize = isMobile ? 64 : 80;

  // IG-specific bubble content
  const renderIgBubble = (onClose: () => void = () => setShowBubble(false)) => (
    <div
      style={{
        background: 'linear-gradient(135deg, #ff3be0, #a100ff)',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 16px 12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
        fontSize: 14,
        maxWidth: 360,
        width: '90vw',
        position: 'relative',
        opacity: showBubble ? 1 : 0,
        transform: showBubble ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          border: 'none',
          background: 'transparent',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        aria-label="Close"
      >
        ×
      </button>

      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Instagram can be a little tricky.
      </div>
      <div style={{ marginBottom: 10, lineHeight: 1.4 }}>
        I'm Jody. I can walk you through posting this reel so you don't
        miss out on points — or prizes.
      </div>

      <button
        type="button"
        onClick={() => {
          setShowTraining(true);
          onClose();
        }}
        style={{
          borderRadius: 999,
          border: 'none',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          backgroundColor: '#ffffff',
          color: '#a100ff',
          boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
        }}
      >
        Show me how
      </button>

      {/* pointer triangle */}
      <div
        style={{
          position: 'absolute',
          bottom: -10,
          right: 30,
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid #a100ff',
        }}
      />
    </div>
  );

  // Ascension-specific bubble content
  const renderAscensionBubble = (onClose: () => void = () => setShowBubble(false)) => (
    <div
      style={{
        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 16px 12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
        fontSize: 14,
        maxWidth: 360,
        width: '90vw',
        position: 'relative',
        opacity: showBubble ? 1 : 0,
        transform: showBubble ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          border: 'none',
          background: 'transparent',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        aria-label="Close"
      >
        ×
      </button>

      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        You made it. Welcome to the Ascension program.
      </div>
      <div style={{ marginBottom: 12, lineHeight: 1.5 }}>
        You're officially in the contest. From here, you're on the road to
        bigger and better things — real money, real prizes, and yes, real
        vacations.
        <br />
        <br />
        All you have to do is more of what you already do: post to social
        media, play games, share things on our site, email friends, or buy
        the book. None of it is mandatory. You can go as far, or as gently,
        as you want.
        <br />
        <br />
        The rewards are real. You really can win a family vacation. And you
        really do earn $2 for every book purchased using your associate
        publisher code.
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          borderRadius: 999,
          border: 'none',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          backgroundColor: '#ffffff',
          color: '#7c3aed',
          boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
        }}
      >
        Got it — let's climb
      </button>

      {/* pointer triangle */}
      <div
        style={{
          position: 'absolute',
          bottom: -10,
          right: 30,
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid #7c3aed',
        }}
      />
    </div>
  );

  // Truth-specific bubble content
  const renderTruthBubble = (onClose: () => void = () => setShowBubble(false)) => (
    <div
      style={{
        background: 'linear-gradient(135deg, #ff3be0, #a100ff)',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 16px 12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
        fontSize: 14,
        maxWidth: 360,
        width: '90vw',
        position: 'relative',
        opacity: showBubble ? 1 : 0,
        transform: showBubble ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          border: 'none',
          background: 'transparent',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        aria-label="Close"
      >
        ×
      </button>

      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Truth Social can be a little… particular.
      </div>
      <div style={{ marginBottom: 10, lineHeight: 1.4 }}>
        I'm Jody. I can walk you through posting this video to Truth Social
        and making sure your contest points are recorded correctly.
      </div>

      <button
        type="button"
        onClick={() => {
          if (onShowTraining) {
            onShowTraining();
          }
          onClose();
        }}
        style={{
          borderRadius: 999,
          border: 'none',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          backgroundColor: '#ffffff',
          color: '#a100ff',
          boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
        }}
      >
        Show me how
      </button>

      {/* pointer triangle */}
      <div
        style={{
          position: 'absolute',
          bottom: -10,
          right: 30,
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid #a100ff',
        }}
      />
    </div>
  );

  // TikTok-specific bubble content (similar to IG)
  const renderTikTokBubble = (onClose: () => void = () => setShowBubble(false)) => (
    <div
      style={{
        background: 'linear-gradient(135deg, #ff3be0, #a100ff)',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 16px 12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
        fontSize: 14,
        maxWidth: 360,
        width: '90vw',
        position: 'relative',
        opacity: showBubble ? 1 : 0,
        transform: showBubble ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          border: 'none',
          background: 'transparent',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        aria-label="Close"
      >
        ×
      </button>

      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        TikTok can be a little tricky.
      </div>
      <div style={{ marginBottom: 10, lineHeight: 1.4 }}>
        I'm Jody. Copy the caption, download the video (it saves to Photos or Files), open TikTok, upload, paste, and tap "I Shared" to get your points.
      </div>

      <button
        type="button"
        onClick={() => {
          if (onShowTraining) {
            onShowTraining();
          }
          onClose();
        }}
        style={{
          borderRadius: 999,
          border: 'none',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          backgroundColor: '#ffffff',
          color: '#a100ff',
          boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
        }}
      >
        Show me how
      </button>

      {/* pointer triangle */}
      <div
        style={{
          position: 'absolute',
          bottom: -10,
          right: 30,
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid #a100ff',
        }}
      />
    </div>
  );

  // X share-specific bubble content
  const renderXShareBubble = (onClose: () => void = () => setShowBubble(false)) => {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #000000, #262626)',
          color: '#fff',
          borderRadius: 16,
          padding: '14px 16px 12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
          fontSize: 14,
          maxWidth: 360,
          width: '90vw',
          position: 'relative',
          opacity: showBubble ? 1 : 0,
          transform: showBubble ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 220ms ease-out, transform 220ms ease-out',
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            border: 'none',
            background: 'transparent',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          aria-label="Close"
        >
          ×
        </button>

        {!showXSteps ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Hey — I'm Jody.
            </div>
            <div style={{ marginBottom: 10, lineHeight: 1.4 }}>
              If you need help posting to X, click my icon.
            </div>
            <button
              type="button"
              onClick={() => setShowXSteps(true)}
              style={{
                borderRadius: 999,
                border: 'none',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: '#ffffff',
                color: '#000000',
                boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.25)';
              }}
            >
              Show me how
            </button>
          </>
        ) : (
          <div style={{ paddingRight: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              How to post to X:
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 0:</strong> Open X in another tab or browser and make sure you're logged in.
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 1:</strong> Click "Copy caption" on this page.
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 2:</strong> Click "Download video" on this page (it saves the MP4 to your device).
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 3:</strong> Go to X → click Post (or open the composer).
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 4:</strong> Upload the video you just downloaded.
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 5:</strong> Paste the caption and publish.
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Step 6:</strong> Come back here and click "I posted to X" to record your post and get your 100 points.
              </li>
              <li style={{ marginBottom: 0 }}>
                <strong>Step 7:</strong> Click "Back to Score" — you'll receive an additional 100 points.
              </li>
            </ol>
          </div>
        )}

        {/* pointer triangle */}
        <div
          style={{
            position: 'absolute',
            bottom: -10,
            right: 30,
            width: 0,
            height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: '10px solid #262626',
          }}
        />
      </div>
    );
  };

  const renderBubble = () => {
    // Don't show any bubble if disabled
    if (disableBubble) return null;
    if (!showBubble) return null;

    if (variant === 'ig') {
      return renderIgBubble(onBubbleClose);
    }

    if (variant === 'tiktok') {
      return renderTikTokBubble(onBubbleClose);
    }

    if (variant === 'truth') {
      return renderTruthBubble(onBubbleClose);
    }

    if (variant === 'ascension') {
      return renderAscensionBubble(onBubbleClose);
    }

    if (variant === 'em2') {
      return renderXShareBubble(onBubbleClose);
    }

    // For other variants, use existing message-based bubble
    if (!message) return null;

    return (
      <div
        style={{
          maxWidth: '320px',
          width: '90%',
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          marginBottom: '8px',
          opacity: showBubble ? 1 : 0,
          transform: showBubble ? 'translateY(0)' : 'translateY(8px)',
          transition: 'all 180ms ease-out',
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={onBubbleClose}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            color: 'white',
            fontSize: '16px',
            lineHeight: '1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
          }}
          aria-label="Close Jody's message"
        >
          ×
        </button>

        <div
          style={{
            fontSize: '0.95rem',
            lineHeight: 1.6,
            paddingRight: '20px',
          }}
        >
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>

        {/* Speech Bubble Pointer */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            right: '24px',
            width: '16px',
            height: '16px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            transform: 'rotate(45deg)',
            borderRadius: '0 0 0 4px',
          }}
        />
      </div>
    );
  };

  const toggleBubble = () => {
    setShowBubble((prev) => !prev);
  };

  return (
    <>
      {/* Mobile share: bottom-sheet overlay when expanded */}
      {useMobileShareLayout && showBubble && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={(e) => e.target === e.currentTarget && onBubbleClose()}
          role="presentation"
        >
          <div
            style={{
              width: '100%',
              maxHeight: '70vh',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              overflowY: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px' }}>
              <button
                type="button"
                onClick={onBubbleClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  touchAction: 'manipulation',
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ padding: '0 16px 24px' }}>
              {renderBubble()}
            </div>
          </div>
        </div>
      )}

      {/* fixed container in bottom-right */}
      <div
        style={{
          position: 'fixed',
          bottom: useMobileShareLayout
            ? 'calc(env(safe-area-inset-bottom) + 92px)'
            : 60,
          right: useMobileShareLayout ? 12 : 24,
          left: useMobileShareLayout ? 12 : undefined,
          zIndex: useMobileShareLayout ? 60 : 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: useMobileShareLayout ? 'flex-start' : 'flex-end',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {/* bubble: on mobile share, shown in bottom-sheet; on desktop, show here */}
        {!useMobileShareLayout && (
          <div style={{ maxWidth: undefined }}>{renderBubble()}</div>
        )}

        {/* Collapsed chip on mobile share: "Need help? Tap Jody" */}
        {useMobileShareLayout ? (
          <button
            type="button"
            onClick={toggleBubble}
            style={{
              pointerEvents: 'auto',
              touchAction: 'manipulation',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid rgba(148, 163, 184, 0.4)',
              background: 'rgba(15, 23, 42, 0.9)',
              color: '#94a3b8',
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
            aria-label="Need help? Tap Jody"
          >
            <img
              src={iconSrc}
              alt=""
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
            />
            Need help? Tap Jody
          </button>
        ) : (
          /* icon - desktop */
          <button
          type="button"
          onClick={toggleBubble}
          style={{
            pointerEvents: 'auto',
            touchAction: 'manipulation',
            width: iconSize,
            height: iconSize,
            borderRadius: '50%',
            border: variant === 'ig' ? '2px solid #ff3be0' : 'none',
            padding: 0,
            background:
              variant === 'ig'
                ? 'radial-gradient(circle at 30% 0%, #ffffff, #2c1540)'
                : 'transparent',
            boxShadow:
              variant === 'ig'
                ? '0 0 0 2px rgba(255,59,224,0.5), 0 12px 30px rgba(0,0,0,0.55)'
                : '0 4px 20px rgba(178, 107, 255, 0.4), 0 0 0 2px rgba(178, 107, 255, 0.2)',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          aria-label="Jody – your concierge"
          onMouseEnter={(e) => {
            if (variant !== 'ig') {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 6px 30px rgba(178, 107, 255, 0.6), 0 0 0 3px rgba(178, 107, 255, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (variant !== 'ig') {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(178, 107, 255, 0.4), 0 0 0 2px rgba(178, 107, 255, 0.2)';
            }
          }}
        >
            <img
              src={iconSrc}
              alt="Jody – your concierge"
              className={variant === 'ascension' ? 'jody-avatar-ascension' : ''}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: variant === 'ig' 
                  ? 'center 35%' 
                  : variant === 'truth' 
                  ? 'center 12%' 
                  : variant === 'ascension'
                  ? 'center 30%' // Adjusted to show more of the top of head
                  : 'center center',
                display: 'block',
                transform: variant === 'ascension' ? 'translateY(2px)' : 'none', // Changed to positive value to move DOWN slightly, showing top of head
              }}
              loading="eager"
            />
        </button>
        )}
      </div>

      {/* IG training modal */}
      {variant === 'ig' && showTraining && (
        <IgTrainingModal onClose={() => setShowTraining(false)} />
      )}
    </>
  );
}

interface IgTrainingModalProps {
  onClose: () => void;
}

// IG training modal component
const IgTrainingModal: React.FC<IgTrainingModalProps> = ({ onClose }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          backgroundColor: '#0b0515',
          borderRadius: 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            How to post this reel on Instagram
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              fontSize: 20,
              cursor: 'pointer',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s',
            }}
            aria-label="Close tutorial"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: isMobile 
              ? '1fr' 
              : 'minmax(0, 2fr) minmax(0, 1.4fr)',
            gap: 18,
            overflow: 'hidden',
          }}
        >
          {/* Video */}
          <div
            style={{
              backgroundColor: '#000',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <video
              src={getTrainingVideoUrl('JODY_IG')}
              controls
              style={{
                width: '100%',
                display: 'block',
                maxHeight: '70vh',
              }}
            />
          </div>

          {/* Steps */}
          <div
            style={{
              color: '#f5f5ff',
              fontSize: 13,
              lineHeight: 1.5,
              overflowY: 'auto',
              maxHeight: '70vh',
              paddingRight: 8,
            }}
          >
            <p style={{ marginTop: 0, marginBottom: 8 }}>
              Follow along with me in the video, or use this quick checklist:
            </p>
            <ol style={{ paddingLeft: 16, margin: 0 }}>
              <li style={{ marginBottom: 8 }}>
                On this page, click <strong>Copy caption</strong>.
              </li>
              <li style={{ marginBottom: 8 }}>
                Click <strong>Download video</strong> to save the reel to
                your Downloads folder.
              </li>
              <li style={{ marginBottom: 8 }}>
                Open the <strong>Instagram</strong> app and tap the{' '}
                <strong>+</strong> icon to create a new reel.
              </li>
              <li style={{ marginBottom: 8 }}>
                Choose <strong>Reel</strong> (if Instagram asks), then
                select the video you just downloaded.
              </li>
              <li style={{ marginBottom: 8 }}>
                Trim or adjust if you'd like, then tap{' '}
                <strong>Next</strong> until you reach the caption screen.
              </li>
              <li style={{ marginBottom: 8 }}>
                In the caption box, tap to focus and press{' '}
                <strong>Ctrl + V</strong> (or long-press &gt; Paste on
                mobile) to paste the caption you copied from this page.
              </li>
              <li style={{ marginBottom: 8 }}>
                Tap <strong>Share</strong> / <strong>Post</strong> and{' '}
                <em>wait</em> until Instagram clearly shows that the reel
                has finished posting.
              </li>
            </ol>

            <div
              style={{
                marginTop: 16,
                padding: 10,
                borderRadius: 10,
                backgroundColor: 'rgba(255,59,224,0.12)',
                border: '1px solid rgba(255,59,224,0.6)',
              }}
            >
              <strong>Important:</strong> if the reel doesn't fully post
              and you move on too quickly, it may not count. DeepQuill LLC
              reserves the right to audit winning entries to confirm posts
              were actually live. It would be a shame to lose a prize
              because one reel never finished uploading.
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: 'rgba(0,255,180,0.08)',
                border: '1px solid rgba(0,255,180,0.45)',
              }}
            >
              <strong>After your reel is posted:</strong> come back to this
              page and click{' '}
              <strong>&ldquo;I posted to Instagram&rdquo;</strong> so your
              points are recorded on the Score page. Remember, you can earn{' '}
              <strong>100 points per post per day</strong> on each platform
              — that's up to <strong>500 points every day</strong>, plus
              extra bonuses when you catch the rabbits.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export default for backward compatibility
export default JodyAssistant;
