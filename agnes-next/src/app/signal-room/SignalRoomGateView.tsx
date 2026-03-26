'use client';

import React, { useState } from 'react';
import Link from 'next/link';

type SignalRoomGateViewProps = {
  /** When code or hybrid, show the access code input */
  showCodeInput: boolean;
};

export default function SignalRoomGateView({ showCodeInput }: SignalRoomGateViewProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/signal-room/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.location.reload();
        return;
      }
      setError(data.error || 'Invalid access code');
    } catch {
      setError('Could not verify. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 2rem',
        minHeight: '60vh',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {/* Transmission secured – campaign narrative */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '2.5rem', opacity: 0.9 }}>📡</span>
        </div>
        <h1
          style={{
            color: '#00ffe0',
            fontSize: '1.5rem',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '0.05em',
          }}
        >
          TRANSMISSION SECURED
        </h1>
        <p
          style={{
            color: '#b0b0b0',
            fontSize: '1rem',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Access is limited to invited participants. The feed will open when you are cleared for transmission.
        </p>

        {showCodeInput && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter access code"
              autoComplete="off"
              style={{
                padding: '0.75rem 1rem',
                fontSize: '1rem',
                backgroundColor: '#0d1220',
                border: '1px solid #2a3a4a',
                borderRadius: 6,
                color: '#e0e0e0',
                outline: 'none',
              }}
            />
            {error && (
              <p style={{ color: '#ff6666', fontSize: '0.9em', margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                backgroundColor: '#00ffe0',
                color: '#0a0e27',
                border: 'none',
                borderRadius: 6,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Verifying…' : 'Submit'}
            </button>
          </form>
        )}

        {!showCodeInput && (
          <p style={{ color: '#666', fontSize: '0.9em', margin: 0 }}>
            Contact the organizers if you believe you should have access.
          </p>
        )}

        <Link
          href="/contest"
          style={{
            color: '#00ffe0',
            fontSize: '0.9em',
            textDecoration: 'none',
            marginTop: '1rem',
          }}
        >
          ← Back to Contest Hub
        </Link>
      </div>
    </div>
  );
}
