// JodyAssistant component for deepquill (plain React version)
import React, { useState, useEffect } from 'react';

const ICON_MAP = {
  em1: '/jody-icons/jody-em1.png',
  em2: '/jody-icons/jody-em2.png',
  fb: '/jody-icons/jody-fb.png',
  ig: '/jody-icons/jody-ig.png',
  tiktok: '/jody-icons/jody-tiktok.png',
  truth: '/jody-icons/jody-truth.png',
  ascension: '/jody-icons/jody-ascension.png',
};

export default function JodyAssistant({
  variant = 'em1',
  message,
  autoShowDelayMs = 4000,
  defaultOpen = false,
}) {
  // Variant flags
  const isEm1 = variant === 'em1';
  const isEm2 = variant === 'em2';

  // Debug logging
  useEffect(() => {
    console.log('[JodyAssistant] Mounted with variant:', variant, 'isEm1:', isEm1, 'isEm2:', isEm2);
  }, [variant, isEm1, isEm2]);

  // em1 state: phase-based system
  const [phase, setPhase] = useState(0); // 0 = icon only, 1 = bubble1, 2 = bubble2, 3 = DeepQuill image

  // em2 state: simple show/hide bubble
  const [showBubbleEm2, setShowBubbleEm2] = useState(false);

  // Other variants state
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Phase-based behavior for em1 variant (Terminal 1)
  useEffect(() => {
    if (!isEm1) return;

    let timeouts = [];
    let cycleActive = true;

    const startCycle = () => {
      if (!cycleActive) return;

      setPhase(0);

      // phase 1 – "Hi! I think I can help."
      timeouts.push(setTimeout(() => {
        if (cycleActive) setPhase(1);
      }, autoShowDelayMs)); // ~4s

      // phase 2 – concierge + #WhereIsJodyVernon
      timeouts.push(setTimeout(() => {
        if (cycleActive) setPhase(2);
      }, autoShowDelayMs + 3000)); // ~7s

      // phase 3 – DeepQuill post
      timeouts.push(setTimeout(() => {
        if (cycleActive) setPhase(3);
      }, autoShowDelayMs + 7000)); // ~11s

      // reset to phase 0, restart cycle
      timeouts.push(setTimeout(() => {
        if (!cycleActive) return;
        setPhase(0);
        startCycle();
      }, autoShowDelayMs + 10000)); // ~14s
    };

    startCycle();

    return () => {
      cycleActive = false;
      timeouts.forEach(clearTimeout);
    };
  }, [isEm1, autoShowDelayMs]);

  // Simple repeating bubble behavior for em2 variant (email terminal)
  useEffect(() => {
    if (!isEm2) return;

    let timeouts = [];
    let cycleActive = true;

    const startCycle = () => {
      if (!cycleActive) return;

      // Start with bubble hidden
      setShowBubbleEm2(false);

      // show after 4s (use autoShowDelayMs, default 4000ms)
      timeouts.push(setTimeout(() => {
        if (cycleActive) {
          console.log('[JodyAssistant em2] Showing bubble after', autoShowDelayMs, 'ms');
          setShowBubbleEm2(true);
        }
      }, autoShowDelayMs));

      // hide after 7s visible (4s delay + 7s visible = 11s total)
      timeouts.push(setTimeout(() => {
        if (cycleActive) {
          console.log('[JodyAssistant em2] Hiding bubble after 7s visible');
          setShowBubbleEm2(false);
        }
      }, autoShowDelayMs + 7000));

      // restart after 20s pause (4s delay + 7s visible + 20s pause = 31s total cycle)
      timeouts.push(setTimeout(() => {
        if (cycleActive) {
          console.log('[JodyAssistant em2] Restarting cycle');
          startCycle();
        }
      }, autoShowDelayMs + 7000 + 20000));
    };

    // Start immediately - first bubble appears after autoShowDelayMs (4 seconds)
    startCycle();

    return () => {
      cycleActive = false;
      timeouts.forEach(clearTimeout);
    };
  }, [isEm2, autoShowDelayMs]);

  // Auto-show for other non-em1/em2 variants
  useEffect(() => {
    if (!isEm1 && !isEm2 && autoShowDelayMs && !defaultOpen) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, autoShowDelayMs);
      return () => clearTimeout(timer);
    }
  }, [isEm1, isEm2, autoShowDelayMs, defaultOpen]);

  // Icon size
  const iconSize = isMobile ? 64 : 80;

  // Container style
  const containerStyle = {
    position: 'fixed',
    bottom: 60,
    right: 24,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
    gap: 12,
  };

  // Bubble style (shared)
  const bubbleStyle = {
    maxWidth: 360,
    width: '90vw',
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
  };

  // Paragraph style
  const paragraphStyle = {
    margin: 0,
    marginBottom: 8,
  };

  // Close button style
  const closeButtonStyle = {
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

  // Pill style for hashtag
  const pillStyle = {
    display: 'inline-block',
    marginTop: 8,
    padding: '4px 9px',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#a100ff',
    fontWeight: 600,
    fontSize: 13,
  };

  // Pointer style
  const pointerStyle = {
    position: 'absolute',
    bottom: -10,
    right: 30,
    width: 0,
    height: 0,
    borderLeft: '10px solid transparent',
    borderRight: '10px solid transparent',
    borderTop: '10px solid #a100ff',
  };

  // DeepQuill image style
  const deepQuillImageStyle = {
    position: 'fixed',
    bottom: iconSize + 160,
    right: 24,
    zIndex: 9998,
    maxWidth: 420,
    width: '90vw',
    borderRadius: 12,
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
    display: 'block',
  };

  // Render em1 bubbles
  const renderEm1Bubble = () => {
    // Double-check: only render if isEm1 AND not isEm2
    if (!isEm1 || isEm2) return null;

    // phase 1 & 2 share visual styling, different text
    if (phase === 1 || phase === 2) {
      return (
        <div style={bubbleStyle}>
          <button onClick={handleClose} style={closeButtonStyle} aria-label="Close">
            ×
          </button>
          {phase === 1 ? (
            <p style={paragraphStyle}><strong>Hi! I think I can help.</strong></p>
          ) : (
            <>
              <p style={paragraphStyle}>
                I'm Jody. I'll be your concierge for this adventure.
              </p>
              <p style={paragraphStyle}>
                In this DeepQuill post, I think you'll find the secret code
                you're looking for:
              </p>
              <div style={pillStyle}>#WhereIsJodyVernon</div>
            </>
          )}
          {/* pointer triangle */}
          <div style={pointerStyle} />
        </div>
      );
    }

    return null;
  };

  // Render em2 bubble
  const renderEm2Bubble = () => {
    // Double-check: only render if isEm2 AND not isEm1
    if (!isEm2 || isEm1 || !showBubbleEm2) return null;

    return (
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
        <button onClick={handleClose} style={closeButtonStyle} aria-label="Close">
          ×
        </button>

        {/* pointer triangle */}
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
          Wondering if you should enter your email?
        </div>
        <div style={{ marginBottom: 6 }}>
          I get it. But your email is how we track <strong>your score</strong>,
          confirm <strong>prizes</strong>, and send your <strong>access key</strong>
          to the redacted chapter.
        </div>
        <div style={{ marginBottom: 8 }}>
          We never sell your info — <strong>ever</strong>. Type your best email
          in the box above and press <strong>Enter</strong> to continue.
        </div>
      </div>
    );
  };

  // Render icon
  const renderIcon = () => {
    // Force correct icon based on variant
    const iconSrc = isEm2 ? ICON_MAP.em2 : (isEm1 ? ICON_MAP.em1 : (ICON_MAP[variant] || ICON_MAP.em1));

    return (
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
            objectPosition: 'center 35%',
            display: 'block',
          }}
          loading="eager"
          onError={(e) => {
            console.error('[JodyAssistant] Failed to load icon:', iconSrc, 'for variant:', variant);
            console.error('[JodyAssistant] isEm1:', isEm1, 'isEm2:', isEm2);
            e.target.style.display = 'none';
          }}
          onLoad={() => {
            console.log('[JodyAssistant] Icon loaded:', iconSrc, 'variant:', variant, 'isEm1:', isEm1, 'isEm2:', isEm2);
          }}
        />
      </div>
    );
  };

  // Click handlers
  const handleIconClick = () => {
    if (isEm1) {
      // if we're idle, jump to "help" phase
      if (phase === 0) {
        setPhase(1);
      } else {
        setPhase(0);
      }
    } else if (isEm2) {
      setShowBubbleEm2((prev) => !prev);
    } else {
      // Other variants
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

  // Render other variant bubbles (if any)
  const renderOtherBubble = () => {
    if (isEm1 || isEm2) return null;
    if (!isOpen || !message) return null;

    return (
      <div style={bubbleStyle}>
        <button onClick={handleClose} style={closeButtonStyle} aria-label="Close">
          ×
        </button>
        {typeof message === 'string' ? <p style={paragraphStyle}>{message}</p> : message}
        <div style={pointerStyle} />
      </div>
    );
  };

  return (
    <>
      {/* DeepQuill image - em1 only, phase 3 */}
      {isEm1 && phase === 3 && (
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
              console.error('Failed to load jody-deepquill-post.png');
              e.target.style.display = 'none';
            }}
          />
        </div>
      )}

      <div style={containerStyle}>
        {/* em1 bubbles - ONLY render if isEm1 */}
        {isEm1 && (phase === 1 || phase === 2) && renderEm1Bubble()}

        {/* em2 bubble - ONLY render if isEm2 */}
        {isEm2 && renderEm2Bubble()}

        {/* Other variant bubbles */}
        {!isEm1 && !isEm2 && renderOtherBubble()}

        {/* Icon - always render, uses correct variant icon */}
        {renderIcon()}
      </div>

      {/* CSS for hover effect (desktop only) and animations */}
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
