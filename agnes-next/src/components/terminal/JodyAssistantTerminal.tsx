'use client';

import React, { useState, useEffect } from 'react';

const ICON_MAP: Record<string, string> = {
  em1: '/jody-icons/jody-em1.png',
  em2: '/jody-icons/jody-em2.png',
  fb: '/jody-icons/jody-fb.png',
  ig: '/jody-icons/jody-ig.png',
  tiktok: '/jody-icons/jody-tiktok.png',
  truth: '/jody-icons/jody-truth.png',
  ascension: '/jody-icons/jody-ascension.png',
};

/** em1: time each hint bubble stays visible (slow-reader friendly). */
const EM1_HINT1_MS = 16_000;
const EM1_HINT2_MS = 16_000;
const EM1_HINT3_MS = 18_000;
const EM1_IMAGE_MS = 14_000;

interface JodyAssistantTerminalProps {
  variant?: string;
  message?: React.ReactNode;
  /** em2 timing for bubble / cycle starts */
  autoShowDelayMs?: number;
  /** em1 only: ms after mount before Jody (icon + hints) appears at all */
  appearDelayMs?: number;
  defaultOpen?: boolean;
}

export default function JodyAssistantTerminal({
  variant = 'em1',
  autoShowDelayMs = 4000,
  appearDelayMs = 0,
  defaultOpen = false,
}: JodyAssistantTerminalProps) {
  const isEm1 = variant === 'em1';
  const isEm2 = variant === 'em2';

  const [phase, setPhase] = useState(0);
  const [em1Revealed, setEm1Revealed] = useState(appearDelayMs <= 0);
  const [showBubbleEm2, setShowBubbleEm2] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobileTerminal = () => {
      if (typeof document !== 'undefined') {
        setIsMobile(document.body.classList.contains('mobile-terminal'));
      }
    };
    checkMobileTerminal();

    const observer = new MutationObserver(checkMobileTerminal);
    if (typeof document !== 'undefined' && document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    window.addEventListener('resize', checkMobileTerminal);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkMobileTerminal);
    };
  }, []);

  useEffect(() => {
    if (!isEm1) return;
    if (appearDelayMs <= 0) return;
    const t = setTimeout(() => setEm1Revealed(true), appearDelayMs);
    return () => clearTimeout(t);
  }, [isEm1, appearDelayMs]);

  useEffect(() => {
    if (!isEm1) return;

    let timeouts: ReturnType<typeof setTimeout>[] = [];
    let cycleActive = true;

    const startCycle = () => {
      if (!cycleActive) return;
      setPhase(1);
      const tTo2 = EM1_HINT1_MS;
      const tTo3 = tTo2 + EM1_HINT2_MS;
      const tTo4 = tTo3 + EM1_HINT3_MS;
      const tLoop = tTo4 + EM1_IMAGE_MS;

      timeouts.push(
        setTimeout(() => {
          if (cycleActive) setPhase(2);
        }, tTo2)
      );
      timeouts.push(
        setTimeout(() => {
          if (cycleActive) setPhase(3);
        }, tTo3)
      );
      timeouts.push(
        setTimeout(() => {
          if (cycleActive) setPhase(4);
        }, tTo4)
      );
      timeouts.push(
        setTimeout(() => {
          if (!cycleActive) return;
          startCycle();
        }, tLoop)
      );
    };

    if (em1Revealed) {
      startCycle();
    }

    return () => {
      cycleActive = false;
      timeouts.forEach(clearTimeout);
    };
  }, [isEm1, em1Revealed]);

  useEffect(() => {
    if (!isEm2) return;

    let timeouts: ReturnType<typeof setTimeout>[] = [];
    let cycleActive = true;

    const startCycle = () => {
      if (!cycleActive) return;

      setShowBubbleEm2(false);

      timeouts.push(
        setTimeout(() => {
          if (cycleActive) setShowBubbleEm2(true);
        }, autoShowDelayMs)
      );

      timeouts.push(
        setTimeout(() => {
          if (cycleActive) setShowBubbleEm2(false);
        }, autoShowDelayMs + 7000)
      );

      timeouts.push(
        setTimeout(() => {
          if (cycleActive) startCycle();
        }, autoShowDelayMs + 7000 + 20000)
      );
    };

    startCycle();

    return () => {
      cycleActive = false;
      timeouts.forEach(clearTimeout);
    };
  }, [isEm2, autoShowDelayMs]);

  useEffect(() => {
    if (!isEm1 && !isEm2 && autoShowDelayMs && !defaultOpen) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, autoShowDelayMs);
      return () => clearTimeout(timer);
    }
  }, [isEm1, isEm2, autoShowDelayMs, defaultOpen]);

  const iconSize = isMobile ? 64 : 80;
  const actionBarHeight = isMobile ? 100 : 0;

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: isMobile ? actionBarHeight + 12 : 60,
    right: isMobile ? 12 : 24,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
    gap: 12,
  };

  const bubbleStyle: React.CSSProperties = {
    maxWidth: isMobile ? 'calc(100vw - 80px)' : 360,
    width: isMobile ? 'calc(100vw - 80px)' : '90vw',
    background: 'linear-gradient(135deg, #ff3be0, #a100ff)',
    color: '#fff',
    borderRadius: 16,
    padding: '14px 16px 16px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'auto',
    position: 'relative',
    animation: 'fadeInUp 0.25s ease-out',
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 1.4,
    maxHeight: isMobile ? 'calc(100vh - 200px)' : 'none',
    overflowY: isMobile ? 'auto' : 'visible',
    WebkitOverflowScrolling: isMobile ? 'touch' : 'auto',
  };

  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: 6,
    right: 8,
    border: 'none',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  };

  const pillStyle: React.CSSProperties = {
    display: 'inline-block',
    marginTop: 8,
    padding: '4px 9px',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#a100ff',
    fontWeight: 600,
    fontSize: 13,
  };

  const pointerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: -10,
    right: 30,
    width: 0,
    height: 0,
    borderLeft: '10px solid transparent',
    borderRight: '10px solid transparent',
    borderTop: '10px solid #a100ff',
  };

  const deepQuillImageStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: isMobile ? actionBarHeight + iconSize + 20 : iconSize + 160,
    right: isMobile ? 12 : 24,
    zIndex: 9998,
    maxWidth: isMobile ? 'calc(100vw - 24px)' : 420,
    width: isMobile ? 'calc(100vw - 24px)' : '90vw',
    borderRadius: 12,
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
    display: 'block',
    maxHeight: isMobile ? 'calc(100vh - 200px)' : 'none',
    overflowY: isMobile ? 'auto' : 'visible',
    WebkitOverflowScrolling: isMobile ? 'touch' : 'auto',
  };

  const handleIconClick = () => {
    if (isEm1) {
      if (phase === 0) {
        setPhase(1);
      } else {
        setPhase(0);
      }
    } else if (isEm2) {
      setShowBubbleEm2((prev) => !prev);
    } else {
      setIsOpen((prev) => !prev);
    }
  };

  const handleClose = () => {
    if (isEm1) {
      setPhase(0);
    } else if (isEm2) {
      setShowBubbleEm2(false);
    } else {
      setIsOpen(false);
    }
  };

  const iconSrc = isEm2
    ? ICON_MAP.em2
    : isEm1
      ? ICON_MAP.em1
      : ICON_MAP[variant] || ICON_MAP.em1;

  if (isEm1 && !em1Revealed) {
    return null;
  }

  return (
    <>
      {isEm1 && phase === 4 && (
        <div style={deepQuillImageStyle}>
          <img
            src="/jody-icons/jody-deepquill-post.png"
            alt="DeepQuill post with #WhereIsJodyVernon"
            style={{
              width: '100%',
              borderRadius: 12,
              boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
              display: 'block',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div
        className="jody-assistant-container"
        style={containerStyle}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
          }
        }}
      >
        {isEm1 && (phase === 1 || phase === 2 || phase === 3) && (
          <div className="jody-bubble-container">
            <div style={bubbleStyle}>
              <button
                onClick={handleClose}
                style={closeButtonStyle}
                aria-label="Close"
              >
                ×
              </button>
              {phase === 1 && (
                <>
                  <p style={{ margin: 0, marginBottom: 8 }}>
                    <strong>Hi — I&apos;m Jody.</strong>
                  </p>
                  <p style={{ margin: 0, marginBottom: 0 }}>
                    If you&apos;re staring at that cursor and nothing makes sense, that&apos;s
                    intentional — but you&apos;re not stuck. When the keyboard is open,{' '}
                    <strong>type at the green prompt</strong> (the line with <strong>$</strong>). That&apos;s
                    how this terminal listens.
                  </p>
                </>
              )}
              {phase === 2 && (
                <>
                  <p style={{ margin: 0, marginBottom: 8 }}>
                    <strong>Fair nudge:</strong>
                  </p>
                  <p style={{ margin: 0, marginBottom: 0 }}>
                    The clue sounds like a social hashtag. It starts with{' '}
                    <strong>#where</strong>, it&apos;s about finding me, and it&apos;s typed{' '}
                    <strong>as one word</strong> after the hash — no spaces.
                  </p>
                </>
              )}
              {phase === 3 && (
                <>
                  <p style={{ margin: 0, marginBottom: 8 }}>
                    <strong>I&apos;ll say it plainly:</strong>
                  </p>
                  <p style={{ margin: 0, marginBottom: 8 }}>
                    At the <strong>$</strong> prompt, type this and submit (return / enter):
                  </p>
                  <div style={pillStyle}>#whereisjodyvernon</div>
                  <p style={{ margin: '10px 0 0', fontSize: 13, opacity: 0.95 }}>
                    If your phone drops the <strong>#</strong>,{' '}
                    <strong>whereisjodyvernon</strong> works too. You can also tap{' '}
                    <strong>NEXT</strong> below for a full-screen typing box.
                  </p>
                </>
              )}
              <div style={pointerStyle} />
            </div>
          </div>
        )}

        {isEm2 && showBubbleEm2 && (
          <div className="jody-bubble-container">
            <div
              style={{
                marginBottom: 16,
                maxWidth: 360,
                background: 'linear-gradient(135deg, #ff3be0, #a100ff)',
                color: '#fff',
                padding: '14px 18px',
                borderRadius: 16,
                boxShadow: '0 14px 30px rgba(0, 0, 0, 0.45)',
                fontSize: 14,
                lineHeight: 1.5,
                position: 'relative',
              }}
            >
              <button
                onClick={handleClose}
                style={closeButtonStyle}
                aria-label="Close"
              >
                ×
              </button>

              <div
                style={{
                  position: 'absolute',
                  bottom: -10,
                  right: 32,
                  width: 0,
                  height: 0,
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderTop: '10px solid #a100ff',
                }}
              />

              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Hey — you made it. Take a breath.
              </div>
              <div style={{ marginBottom: 6 }}>
                This step is boring on purpose: your email is only so we can{' '}
                <strong>attach your score</strong>, <strong>confirm prizes</strong>, and send your{' '}
                <strong>redacted-chapter access key</strong>.
              </div>
              <div style={{ marginBottom: 8 }}>
                We don&apos;t sell your information. Type the email you actually check, then tap{' '}
                <strong>Submit for clearance</strong> once — that moves you forward.
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: '9999px',
            overflow: 'hidden',
            boxShadow: '0 0 18px rgba(255, 59, 224, 0.7)',
            cursor: 'pointer',
            pointerEvents: 'auto',
            transition: 'transform 0.18s ease-out, box-shadow 0.18s ease-out',
          }}
          onClick={handleIconClick}
          className="jody-icon"
          role="button"
          tabIndex={0}
          aria-label="Jody – your concierge"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleIconClick();
            }
          }}
        >
          <img
            src={iconSrc}
            alt="Jody"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: isEm2 ? 'center 16%' : 'center 25%',
              display: 'block',
              transform: isEm2 ? 'none' : 'translateY(4px)',
            }}
            loading="eager"
          />
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (min-width: 769px) {
          .jody-icon:hover {
            transform: scale(1.06);
            box-shadow: 0 0 20px rgba(255, 59, 224, 0.85) !important;
          }
        }
      `}</style>
    </>
  );
}
