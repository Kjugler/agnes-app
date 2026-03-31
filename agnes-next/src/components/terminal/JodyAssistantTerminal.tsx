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

/** em1: time each hint bubble stays visible (slow-reader friendly). Desktop fixed layout. */
const EM1_HINT1_MS = 16_000;
const EM1_HINT2_MS = 16_000;
const EM1_HINT3_MS = 18_000;
const EM1_IMAGE_MS = 14_000;

/** Inline mobile: pause before revealing the next message from Jody (same pacing as desktop hints). */
const INLINE_STACK_MS_1 = EM1_HINT1_MS;
const INLINE_STACK_MS_2 = EM1_HINT3_MS;
/** First Jody line waits briefly so the scroll cue reads alone (cinematic, one beat at a time). */
const INLINE_FIRST_BEAT_MS = 720;

export type JodyTerminalLayoutMode = 'fixed' | 'inline-mobile';

interface JodyAssistantTerminalProps {
  variant?: string;
  message?: React.ReactNode;
  /** em2 timing for bubble / cycle starts (desktop fixed only) */
  autoShowDelayMs?: number;
  /** em1 only: ms after mount before Jody (icon + hints) appears at all (desktop fixed only) */
  appearDelayMs?: number;
  defaultOpen?: boolean;
  /**
   * Mobile terminal: document-flow hints — no fixed overlay; em1 stacks timed bubbles in-page.
   * Desktop always uses `fixed` (default).
   */
  layoutMode?: JodyTerminalLayoutMode;
}

/**
 * Below NEXT: thin directional cue (not a hint bubble). Lighter than IBM mono body.
 */
export function JodyMobileScrollCue({ variant }: { variant: 'em1' | 'em2' }) {
  const copy =
    variant === 'em1'
      ? 'More below — scroll when you’re ready.'
      : 'A short note below — scroll on.';
  return (
    <div
      className="jody-terminal-mobile-scroll-cue"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        padding: '8px 20px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0) 100%)',
      }}
    >
      <span
        style={{
          fontSize: 15,
          lineHeight: 1,
          color: 'rgba(74, 222, 128, 0.45)',
          fontWeight: 200,
          transform: 'scaleY(1.15)',
        }}
      >
        ↓
      </span>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.4,
          letterSpacing: '0.03em',
          color: 'rgba(134, 239, 172, 0.72)',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontWeight: 400,
          fontStyle: 'normal',
          textAlign: 'center',
          maxWidth: 260,
        }}
      >
        {copy}
      </p>
    </div>
  );
}

/** Softer, cinematic bubbles for mobile scroll hints (not harsh magenta slabs). */
const bubbleSubtle: React.CSSProperties = {
  background: 'linear-gradient(146deg, rgba(120, 45, 120, 0.65), rgba(85, 32, 110, 0.78))',
  color: '#faf5ff',
  borderRadius: 14,
  padding: '12px 14px 14px',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.28)',
  fontSize: 13,
  lineHeight: 1.5,
  border: '1px solid rgba(255, 255, 255, 0.1)',
  position: 'relative',
};

const bubbleGradient: React.CSSProperties = {
  background: 'linear-gradient(135deg, #ff3be0, #a100ff)',
  color: '#fff',
  borderRadius: 16,
  padding: '14px 16px 16px',
  boxShadow: '0 14px 32px rgba(0, 0, 0, 0.4)',
  fontSize: 14,
  lineHeight: 1.45,
  position: 'relative',
};

function JodySaysRowEm1({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <img
        src={ICON_MAP.em1}
        alt="Jody"
        width={44}
        height={44}
        style={{
          borderRadius: '50%',
          objectFit: 'cover',
          objectPosition: 'center 25%',
          flexShrink: 0,
          boxShadow: '0 0 12px rgba(255, 59, 224, 0.32)',
          transform: 'translateY(2px)',
        }}
        loading="lazy"
      />
      <div style={{ ...bubbleSubtle, flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function JodySaysRowEm2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <img
        src={ICON_MAP.em2}
        alt="Jody"
        width={44}
        height={44}
        style={{
          borderRadius: '50%',
          objectFit: 'cover',
          objectPosition: 'center 16%',
          flexShrink: 0,
          boxShadow: '0 0 12px rgba(255, 59, 224, 0.28)',
        }}
        loading="lazy"
      />
      <div style={{ ...bubbleSubtle, flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

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

function InlineMobileEm1() {
  const [showFairNudge, setShowFairNudge] = useState(false);
  const [showCodeHint, setShowCodeHint] = useState(false);
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    const t0 = window.setTimeout(() => setShowFairNudge(true), INLINE_FIRST_BEAT_MS);
    const t1 = window.setTimeout(() => setShowCodeHint(true), INLINE_FIRST_BEAT_MS + INLINE_STACK_MS_1);
    const t2 = window.setTimeout(
      () => setShowImage(true),
      INLINE_FIRST_BEAT_MS + INLINE_STACK_MS_1 + INLINE_STACK_MS_2
    );
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <section
      aria-label="Hints from Jody"
      className="jody-terminal-mobile-article"
      style={{
        padding:
          '12px 16px max(32px, calc(16px + env(safe-area-inset-bottom, 0px)))',
        maxWidth: 560,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {showFairNudge && (
        <JodySaysRowEm1>
          <p style={{ margin: 0, marginBottom: 6 }}>
            <strong>Fair nudge:</strong>
          </p>
          <p style={{ margin: 0, marginBottom: 6 }}>
            The trail sounds like something you&apos;d tag on social. It starts with <strong>#where</strong>,
            it&apos;s about finding me, and after the hash it&apos;s <strong>one word</strong> — no spaces.
          </p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.88 }}>
            Some hunters chase a name that way — single track, single word. You&apos;ll know it when you type it.
          </p>
        </JodySaysRowEm1>
      )}

      {showCodeHint && (
        <JodySaysRowEm1>
          <p style={{ margin: 0, marginBottom: 6 }}>
            <strong>Sharper vector:</strong>
          </p>
          <p style={{ margin: 0, marginBottom: 8 }}>
            At the <strong>$</strong> prompt, enter this and send it (return / enter):
          </p>
          <div style={{ ...pillStyle, fontSize: 12 }}>#whereisjodyvernon</div>
          <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.9 }}>
            If your device eats the hash, <strong>whereisjodyvernon</strong> alone still works. Prefer a big
            typing field? Use <strong>NEXT</strong> tucked right under the line.
          </p>
        </JodySaysRowEm1>
      )}

      {showImage && (
        <div style={{ marginTop: 4 }}>
          <p
            style={{
              margin: '0 0 8px 4px',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(167, 139, 250, 0.65)',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            }}
          >
            From the field
          </p>
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 8px 22px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <img
              src="/jody-icons/jody-deepquill-post.png"
              alt="DeepQuill post with #WhereIsJodyVernon"
              style={{ width: '100%', display: 'block', verticalAlign: 'top' }}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** Terminal 2 — single beat from Jody after scroll; soft, one bubble. */
function InlineMobileEm2() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 420);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) {
    return (
      <section className="jody-terminal-mobile-article" aria-label="Note from Jody" style={{ minHeight: 24 }} />
    );
  }

  return (
    <section
      aria-label="Note from Jody"
      className="jody-terminal-mobile-article"
      style={{
        padding:
          '8px 16px max(48px, calc(24px + env(safe-area-inset-bottom, 0px)))',
        maxWidth: 560,
        margin: '0 auto',
      }}
    >
      <JodySaysRowEm2>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Hey — you made it.</div>
        <p style={{ margin: '0 0 8px' }}>
          Quiet step on purpose: email only so we can <strong>attach your score</strong>,{' '}
          <strong>confirm prizes</strong>, and send your <strong>redacted-chapter access key</strong>.
        </p>
        <p style={{ margin: 0, opacity: 0.92, fontSize: 12 }}>
          We don&apos;t sell your information. Submit once — you&apos;re through.
        </p>
      </JodySaysRowEm2>
    </section>
  );
}

export default function JodyAssistantTerminal({
  variant = 'em1',
  autoShowDelayMs = 4000,
  appearDelayMs = 0,
  defaultOpen = false,
  layoutMode = 'fixed',
}: JodyAssistantTerminalProps) {
  const isEm1 = variant === 'em1';
  const isEm2 = variant === 'em2';
  const inlineMobile = layoutMode === 'inline-mobile';

  const [phase, setPhase] = useState(0);
  const [em1Revealed, setEm1Revealed] = useState(appearDelayMs <= 0 || inlineMobile);
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
    if (inlineMobile) return;
    if (!isEm1) return;
    if (appearDelayMs <= 0) return;
    const t = setTimeout(() => setEm1Revealed(true), appearDelayMs);
    return () => clearTimeout(t);
  }, [inlineMobile, isEm1, appearDelayMs]);

  useEffect(() => {
    if (inlineMobile) return;
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
  }, [inlineMobile, isEm1, em1Revealed]);

  useEffect(() => {
    if (inlineMobile) return;
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
  }, [inlineMobile, isEm2, autoShowDelayMs]);

  useEffect(() => {
    if (inlineMobile) return;
    if (!isEm1 && !isEm2 && autoShowDelayMs && !defaultOpen) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, autoShowDelayMs);
      return () => clearTimeout(timer);
    }
  }, [inlineMobile, isEm1, isEm2, autoShowDelayMs, defaultOpen]);

  if (inlineMobile) {
    if (isEm1) return <InlineMobileEm1 />;
    if (isEm2) return <InlineMobileEm2 />;
    return null;
  }

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
