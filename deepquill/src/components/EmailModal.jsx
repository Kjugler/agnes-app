// deepquill/src/components/EmailModal.jsx
import React, { useState } from 'react';
import { subscribeEmail } from '../api/subscribeEmail';

const NEXT_PUBLIC_SITE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NEXT_PUBLIC_SITE_URL) ||
  'http://localhost:3002';

// Fetch with timeout helper
async function fetchWithTimeout(url, opts = {}, timeoutMs = 2000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal, cache: 'no-store' });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// Ping ngrok health endpoint with retries
async function pingNgrok(maxRetries = 3) {
  const url = `${NEXT_PUBLIC_SITE_URL}/api/ok`;
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxRetries) {
    try {
      const res = await fetchWithTimeout(url, {}, 2000 + attempt * 500);
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        console.info('[handoff:ok]', { url, attempt, j });
        return true;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    attempt += 1;
    await new Promise((r) => setTimeout(r, 400 * attempt)); // small backoff
  }
  console.warn('[handoff:fail]', { url, lastErr, attempts: attempt });
  return false;
}

const EmailModal = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleHandoff = (code, email) => {
    const bootUrl = new URL('/contest/boot', NEXT_PUBLIC_SITE_URL);
    if (code) bootUrl.searchParams.set('code', code);
    if (email) bootUrl.searchParams.set('email', email);
    bootUrl.searchParams.set('next', '/lightening');

    console.info('[handoff:url]', bootUrl.toString());
    window.location.href = bootUrl.toString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setError('');

    try {
      const result = await subscribeEmail(email);

      if (result?.message) {
        setMessage(`✅ ${result.message}`);
        setEmail('');

        // Extract code from URL params (ref or code)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('ref') || urlParams.get('code') || '';

        // Pre-handoff health check
        setChecking(true);
        const healthy = await pingNgrok(3);

        if (!healthy) {
          setChecking(false);
          setError(
            'Public server is offline. Start ngrok for port 3002 and verify VITE_NEXT_PUBLIC_SITE_URL. ' +
              'You can retry, or Force Handoff if you know it just came up.'
          );
          return;
        }

        setChecking(false);
        // Small delay for UX, then handoff
        setTimeout(() => {
          handleHandoff(code, email);
        }, 300);
      } else {
        setMessage(`❌ ${result?.error || 'Something went wrong. Please try again.'}`);
      }
    } catch (error) {
      setMessage('❌ Something went wrong. Please try again.');
      setChecking(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-green-500 text-2xl font-mono mb-4">Access Granted</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-green-500 font-mono mb-2">
              Request access to the redacted chapter
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-2 bg-black text-green-500 border border-green-500 rounded focus:outline-none focus:border-green-400 placeholder-green-500/50 font-mono"
              required
            />
          </div>

          {message && (
            <p
              className={`text-sm font-mono ${
                message.startsWith('✅') ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {message}
            </p>
          )}

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || checking}
            className="w-full bg-green-500 text-black py-3 px-4 rounded hover:bg-green-600 transition-colors font-mono text-lg font-bold disabled:opacity-50"
          >
            {checking
              ? 'Checking server…'
              : isSubmitting
                ? 'REQUESTING...'
                : 'REQUEST ACCESS'}
          </button>

          {/* Force Handoff button (shown when health check fails) */}
          {error && (
            <button
              type="button"
              onClick={() => {
                const urlParams = new URLSearchParams(window.location.search);
                const code = urlParams.get('ref') || urlParams.get('code') || '';
                handleHandoff(code, email);
              }}
              className="w-full mt-2 bg-yellow-600 text-white py-2 px-4 rounded hover:bg-yellow-700 transition-colors font-mono text-sm font-bold"
            >
              Force Handoff
            </button>
          )}
        </form>

        {/* Access Report Block */}
        <div className="mt-8 p-4 border border-green-500/30 rounded bg-black/50">
          <h3 className="text-green-500 font-mono text-lg mb-4">ACCESS REPORT</h3>
          <div className="space-y-2 text-green-500/80 font-mono">
            <p>Protocol Visitors: 413,128</p>
            <p>Redacted Chapter Requests: 171,927</p>
            <p>Clearance Rate: 41.6%</p>
          </div>
          <p className="mt-4 text-green-500/60 font-mono italic">
            "Only the discerning make it through."
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-6 text-green-500 hover:text-green-400 text-sm font-mono"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default EmailModal;

