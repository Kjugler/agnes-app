'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeEmail } from '@/lib/terminal/subscribeEmail';
import JodyAssistantTerminal from './JodyAssistantTerminal';

interface EmailModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onEmailSubmitted: () => void;
}

/**
 * Terminal 2 — IBM registration host. Jody: same bottom-right bubble + circle as contest/share (em2).
 */
export default function EmailModal({ isOpen, onEmailSubmitted }: EmailModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submittedEmail = email.trim();
    setIsSubmitting(true);
    setMessage('');

    try {
      const subscribeResult = await subscribeEmail(submittedEmail);
      if (subscribeResult?.message || subscribeResult?.ok === true) {
        setMessage(`OK ${subscribeResult.message || 'DIGEST REGISTERED'}`);
      } else {
        console.warn('[EmailModal] subscribeEmail failed, but continuing:', subscribeResult);
      }
    } catch (subscribeErr) {
      console.warn('[EmailModal] subscribeEmail error (non-blocking):', subscribeErr);
    }

    const normalizedEmail = submittedEmail.toLowerCase();

    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CONTEST_ENTERED',
          email: normalizedEmail,
          source: 'contest',
          ref:
            typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).get('ref') || undefined
              : undefined,
          meta: { path: '/contest', source: 'terminal' },
        }),
      }).catch(() => {});
    } catch {}

    try {
      const loginRes = await fetch('/api/contest/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
        credentials: 'include',
      });

      if (loginRes.ok) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('contest_email');
          window.localStorage.removeItem('user_email');
          window.localStorage.removeItem('associate_email');
        }

        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set('email', normalizedEmail);
        currentParams.set('v', 'terminal');

        if (!currentParams.get('ref') && typeof document !== 'undefined') {
          const apRef = document.cookie.match(/ap_ref=([^;]+)/)?.[1]?.trim();
          const refCookie = document.cookie.match(/ref=([^;]+)/)?.[1]?.trim();
          const ref = apRef || refCookie;
          if (ref) currentParams.set('ref', ref);
        }

        onEmailSubmitted();
        window.location.href = `/contest?${currentParams.toString()}`;
      } else {
        let errorMessage = `LOGIN_FAILED (STATUS ${loginRes.status})`;
        try {
          const errorData = await loginRes.json();
          if (errorData?.error) {
            errorMessage = String(errorData.error);
          }
        } catch {
          // ignore
        }
        setMessage(`ERR: ${errorMessage}`);
        setIsSubmitting(false);
      }
    } catch (loginErr) {
      console.error('[EmailModal] Login network error:', loginErr);
      setMessage(
        `ERR: NETWORK — ${loginErr instanceof Error ? loginErr.message : 'FAILED'}`
      );
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted || typeof document === 'undefined') {
    return null;
  }

  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terminal2-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        backgroundColor: '#000',
        color: '#00ff66',
        fontFamily: mono,
        overflowY: 'auto',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div
        style={{
          minHeight: '100vh',
          boxSizing: 'border-box',
          padding: 'clamp(16px, 4vw, 48px)',
          paddingBottom: 'max(160px, 28vh)',
          border: '2px solid #00ff66',
          margin: '12px',
          boxShadow: 'inset 0 0 40px rgba(0, 255, 102, 0.06)',
        }}
      >
        <header style={{ marginBottom: '1.25rem', borderBottom: '1px solid rgba(0,255,102,0.35)', paddingBottom: '0.75rem' }}>
          <div style={{ fontSize: 'clamp(11px, 2.5vw, 13px)', letterSpacing: '0.12em', opacity: 0.85 }}>
            IBM HOST // SESSION 2 // ACCESS REGISTRATION
          </div>
          <h1 id="terminal2-title" style={{ fontSize: 'clamp(1.1rem, 4vw, 1.75rem)', fontWeight: 700, marginTop: '0.5rem' }}>
            &gt; CLEARANCE GRANTED — REDACTED CHAPTER REQUEST
          </h1>
        </header>

        <div style={{ maxWidth: 560 }}>
          <p style={{ lineHeight: 1.6, marginBottom: '1.25rem', fontSize: 'clamp(12px, 2.6vw, 14px)', opacity: 0.9 }}>
            Concierge Jody is standing by (bottom right) if you want the human version of what happens next. On this host: enter your email, submit once, and you&apos;re through.
          </p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="terminal2-email" style={{ display: 'block', marginBottom: 8, fontSize: 12, letterSpacing: '0.08em' }}>
              ENTER EMAIL FOR CLEARANCE:
            </label>
            <input
              id="terminal2-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: 16,
                padding: '14px 16px',
                background: '#000',
                color: '#00ff66',
                border: '2px solid #00ff66',
                borderRadius: 0,
                fontFamily: mono,
                outline: 'none',
                marginBottom: 16,
              }}
            />

            {message && (
              <p style={{ marginBottom: 12, fontSize: 14, color: message.startsWith('OK') ? '#00ff66' : '#ff6b6b' }}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                fontFamily: mono,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.1em',
                padding: '14px 24px',
                background: '#00ff66',
                color: '#000',
                border: 'none',
                borderRadius: 0,
                cursor: isSubmitting ? 'wait' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'TRANSMITTING...' : '[ SUBMIT FOR CLEARANCE ]'}
            </button>
          </form>

          <div
            style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px dashed rgba(0,255,102,0.35)',
              fontSize: 11,
              opacity: 0.65,
              lineHeight: 1.5,
            }}
          >
            <div>PROTOCOL VISITORS (SIMULATED) ..... 413,128</div>
            <div>REDACTED REQUESTS (SIMULATED) ..... 171,927</div>
            <div>CLEARANCE RATE (SIMULATED) ....... 41.6%</div>
          </div>
        </div>
      </div>

      {/* Brand-consistent: bottom-right circle + bubble (same pattern as contest / share help) */}
      <JodyAssistantTerminal variant="em2" autoShowDelayMs={1200} defaultOpen={false} />
    </div>
  );

  return createPortal(panel, document.body);
}
