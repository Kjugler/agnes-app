'use client';

import React from 'react';

const JODY_ICON = '/jody-icons/jody-em2.png';

const bubbleStyle: React.CSSProperties = {
  background: 'linear-gradient(146deg, rgba(0, 120, 110, 0.92), rgba(0, 70, 85, 0.95))',
  color: '#e6fffb',
  borderRadius: 16,
  padding: '16px 18px 14px',
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
  fontSize: 14,
  lineHeight: 1.55,
  border: '1px solid rgba(0, 255, 229, 0.35)',
  maxWidth: 340,
  width: 'min(340px, calc(100vw - 32px))',
  position: 'relative',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const primaryBtn: React.CSSProperties = {
  borderRadius: 999,
  border: 'none',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  backgroundColor: '#00ffe5',
  color: '#001a18',
  boxShadow: '0 4px 12px rgba(0, 255, 229, 0.25)',
};

const secondaryBtn: React.CSSProperties = {
  borderRadius: 999,
  border: '1px solid rgba(0, 255, 229, 0.45)',
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  backgroundColor: 'transparent',
  color: '#b8fff8',
};

interface JodyConciergeShellProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  minimized?: boolean;
  onAvatarClick?: () => void;
}

/** Static Jody — no pulse, no entrance animation. Earn polish with data first. */
export function JodyConciergeShell({
  open,
  onClose,
  children,
  minimized = false,
  onAvatarClick,
}: JodyConciergeShellProps) {
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        right: 'max(16px, env(safe-area-inset-right))',
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        pointerEvents: 'none',
      }}
    >
      {open && !minimized && (
        <div style={{ ...bubbleStyle, pointerEvents: 'auto' }}>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                border: 'none',
                background: 'transparent',
                color: '#b8fff8',
                fontSize: 18,
                cursor: 'pointer',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          )}
          {children}
          <div
            style={{
              position: 'absolute',
              bottom: -8,
              right: 28,
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '8px solid rgba(0, 70, 85, 0.95)',
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onAvatarClick}
        aria-label="Jody, your reading concierge"
        style={{
          pointerEvents: 'auto',
          border: '2px solid rgba(0, 255, 229, 0.5)',
          borderRadius: '50%',
          padding: 0,
          width: 56,
          height: 56,
          overflow: 'hidden',
          cursor: onAvatarClick ? 'pointer' : 'default',
          background: '#000',
          boxShadow: '0 0 12px rgba(0, 255, 229, 0.25)',
        }}
      >
        <img
          src={JODY_ICON}
          alt=""
          width={56}
          height={56}
          style={{
            objectFit: 'cover',
            objectPosition: 'center 16%',
            display: 'block',
          }}
        />
      </button>
    </div>
  );
}

export { primaryBtn, secondaryBtn };
