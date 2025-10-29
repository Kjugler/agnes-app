'use client';

import { useEffect, useState } from 'react';

type PointsResponse = { totalPoints?: number; error?: string };

export default function CurrentScoreButton({ className = '' }: { className?: string }) {
  const [show, setShow] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const qp = new URLSearchParams(window.location.search);
      const isReturnNew = qp.get('new') === '1';

      try {
        const sessionId = localStorage.getItem('last_session_id') || '';

        // 1) If we just returned from Stripe, celebrate *immediately* (no gating).
        if (isReturnNew) {
          setShow(true);
          setCelebrate(true);
          setTimeout(() => !cancelled && setCelebrate(false), 10000);
        }

        // 2) Ask the API what the real total is (so we know if the button should persist)
        if (!sessionId) {
          // No session yet → if not a fresh return, keep hidden
          if (!isReturnNew) setShow(false);
          return;
        }

        const res = await fetch(`/api/points?sessionId=${encodeURIComponent(sessionId)}`, {
          method: 'GET',
          credentials: 'include',
        }).catch(() => null);

        if (!res || !res.ok) {
          // Fail-closed: only show if we're in the immediate-return window
          if (!isReturnNew) setShow(false);
          return;
        }

        const json = (await res.json()) as PointsResponse;
        const current = Math.max(0, Number(json?.totalPoints || 0));
        const last = Math.max(0, Number(localStorage.getItem('contest:last-points') || 0));

        // Should the button be visible after the celebration?
        const shouldShow = isReturnNew || current > 0;
        setShow(shouldShow);

        // Trigger celebration if points actually increased (covers future actions too)
        if (!isReturnNew && current > last) {
          setCelebrate(true);
          setTimeout(() => !cancelled && setCelebrate(false), 10000);
        }

        // Persist state
        localStorage.setItem('contest:last-points', String(current));
        try { localStorage.removeItem('contest:has-points'); } catch {}
      } catch {
        // Any unexpected issue → keep whatever we already decided:
        // - show if isReturnNew (for the immediate celebration),
        // - otherwise hide.
        if (!isReturnNew) setShow(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const baseButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    border: '1px solid #1d6b2b',
    background: '#118a34',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: 10,
    fontWeight: 700,
    letterSpacing: 0.2,
    transition: 'transform 180ms ease, box-shadow 180ms ease, filter 180ms ease',
    transform: hovered ? 'translateY(1px) rotate(-0.6deg)' : 'none',
    boxShadow: hovered
      ? '0 14px 26px -12px rgba(17,138,52,0.75)'
      : celebrate
      ? '0 0 0 12px rgba(17,138,52,0.18), 0 10px 24px -12px rgba(17,138,52,0.7)'
      : '0 6px 16px -10px rgba(17,138,52,0.55)',
    filter: hovered ? 'brightness(1.05)' : 'none',
  };

  return (
    <div style={{ marginTop: 12, position: 'relative', display: 'inline-block' }}>
      {/* Tipsy bubble + salute — only during celebration */}
      {celebrate && (
        <div
          aria-hidden
          className="tipsy"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '100%',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 5,
          }}
        >
          <span
            className="salute"
            style={{
              fontSize: 22,
              lineHeight: 1,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
              display: 'inline-block',
            }}
          >
            🫡
          </span>
          <span
            className="tipsy-text"
            style={{
              background: 'rgba(17,17,17,0.94)',
              color: '#e6ffe6',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.2,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            Check out your new points
          </span>
        </div>
      )}

      {/* Heartbeat halo */}
      {celebrate && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -8,
            borderRadius: 16,
            background:
              'radial-gradient(120px 40px at 50% 50%, rgba(16,185,129,0.22), rgba(16,185,129,0) 70%)',
            filter: 'blur(2px)',
            pointerEvents: 'none',
            animation: 'heartbeat 1200ms ease-in-out infinite',
          }}
        />
      )}

      <a
        href="/contest/score" // switch to /contest/badges later together
        className={`${className} score-btn ${celebrate ? 'is-celebrate' : 'is-quiet'}`}
        data-qa="current-score-btn"
        aria-label="View your current contest score and badges"
        style={baseButton}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        View your points
        {celebrate && (
          <span
            aria-hidden
            className="spark"
            style={{
              marginLeft: 4,
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.95)',
              boxShadow: '0 0 10px 3px rgba(255,255,255,0.6)',
              verticalAlign: 'middle',
            }}
          />
        )}
      </a>

      {/* Scoped animations */}
      <style jsx>{`
        @keyframes heartbeat {
          0%   { opacity: 0.5; transform: scale(1); }
          20%  { opacity: 0.85; transform: scale(1.02); }
          40%  { opacity: 1; transform: scale(1.04); }
          60%  { opacity: 0.85; transform: scale(1.02); }
          80%  { opacity: 0.6; transform: scale(1.01); }
          100% { opacity: 0.5; transform: scale(1); }
        }
        .tipsy { animation: bob 1400ms ease-in-out infinite; }
        @keyframes bob {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -6px); }
        }
        .salute { animation: salute 1400ms ease-in-out infinite; }
        @keyframes salute {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          50% { transform: rotate(-8deg) translateY(-2px); }
        }
        .score-btn.is-celebrate { animation: btnbeat 1200ms ease-in-out infinite; }
        @keyframes btnbeat {
          0%   { filter: brightness(1.0); }
          40%  { filter: brightness(1.08); }
          100% { filter: brightness(1.0); }
        }
        .score-btn:focus-visible {
          outline: 2px solid #34d399;
          outline-offset: 3px;
        }
      `}</style>
    </div>
  );
}
