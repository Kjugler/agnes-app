// deepquill/src/components/EmailModal.jsx
import React, { useState } from 'react';
import { subscribeEmail } from '../api/subscribeEmail';
import JodyAssistant from './JodyAssistant';

const EmailModal = ({ isOpen, onClose, onEmailSubmitted }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    // Try to subscribe email (non-blocking - we'll proceed even if it fails)
    try {
      const subscribeResult = await subscribeEmail(email);
      console.log('[EmailModal] subscribeEmail result:', subscribeResult);
      if (subscribeResult?.message || subscribeResult?.ok === true) {
        setMessage(`✅ ${subscribeResult.message || 'Email received!'}`);
      } else {
        console.warn('[EmailModal] subscribeEmail failed, but continuing:', subscribeResult);
      }
    } catch (subscribeErr) {
      console.warn('[EmailModal] subscribeEmail error (non-blocking):', subscribeErr);
      // Continue anyway - subscription is not required for contest login
    }
    
    // Clear email field
    setEmail('');

    // --- fire tracking event to Next (agnes-next) ---
    // Determine the correct base URL for agnes-next
    // Priority: env var > current origin (always use when available) > localhost fallback
    let NEXT_BASE = null;
    
    // Check env var first (should be ngrok URL in dev)
    const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AGNES_BASE_URL : null;
    if (envUrl) {
      NEXT_BASE = envUrl;
      console.log('[EmailModal] Using env var:', envUrl);
    } else if (typeof window !== 'undefined' && window.location) {
      // Always use current origin when available (works for ngrok, localhost, etc.)
      // This ensures we use the same origin that's serving the page
      NEXT_BASE = `${window.location.protocol}//${window.location.host}`;
      console.log('[EmailModal] Using current origin:', NEXT_BASE, {
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        host: window.location.host,
      });
    } else {
      // Fallback to localhost for local dev (should rarely happen)
      NEXT_BASE = 'http://localhost:3002';
      console.log('[EmailModal] Using localhost fallback:', NEXT_BASE);
    }
    
    // Debug: log what URL we're using
    console.log('[EmailModal] NEXT_BASE determined:', {
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
      port: typeof window !== 'undefined' ? window.location.port : 'unknown',
      origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
      final: NEXT_BASE,
    });

    // Fire tracking event (non-blocking) - F1: Use absolute path when in terminal-proxy
    try {
      const isTerminalProxy = typeof window !== 'undefined' && window.location.pathname.startsWith('/terminal-proxy');
      const trackUrl = isTerminalProxy 
        ? `${window.location.origin}/api/track`
        : '/api/track';
      fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CONTEST_ENTERED',
          email,
          source: 'contest',
          ref: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || undefined : undefined,
          meta: { path: '/contest', source: 'terminal' },
        }),
      }).catch(() => {});
    } catch {}

    // F1: Call /api/contest/login - use absolute path when in terminal-proxy to avoid 405
    const normalizedEmail = email.trim().toLowerCase();
    // Detect if we're in terminal-proxy (path starts with /terminal-proxy)
    const isTerminalProxy = typeof window !== 'undefined' && window.location.pathname.startsWith('/terminal-proxy');
    // Use absolute path when in terminal-proxy to go to root /api/* routes
    const loginUrl = isTerminalProxy 
      ? `${window.location.origin}/api/contest/login`
      : '/api/contest/login';
    console.log('[EmailModal] Calling /api/contest/login', {
      email: normalizedEmail,
      url: loginUrl,
      origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      isTerminalProxy,
      note: isTerminalProxy ? 'Using absolute path for terminal-proxy (avoids 405)' : 'Using relative path',
    });
    
    try {
      console.log('[EmailModal] Making fetch request:', {
        url: loginUrl,
        method: 'POST',
        email: normalizedEmail,
        credentials: 'include',
      });
      
      // F1: Use absolute path when in terminal-proxy, include credentials, match Next route expectations
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: normalizedEmail,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
        credentials: 'include', // F1: Include cookies for CORS
      });

      console.log('[EmailModal] Login response received:', {
        status: loginRes.status,
        statusText: loginRes.statusText,
        ok: loginRes.ok,
        headers: Object.fromEntries(loginRes.headers.entries()),
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        console.log('[EmailModal] Login successful:', loginData);
        
        // Clear any old localStorage data to ensure fresh start
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('contest_email');
            window.localStorage.removeItem('user_email');
            window.localStorage.removeItem('associate_email');
            console.log('[EmailModal] Cleared old localStorage data');
          }
        } catch (e) {
          console.warn('[EmailModal] Could not clear localStorage', e);
        }
        
        // Spec 1: Terminal return → /contest (Lightning already played before terminal)
        // Preserve ref, email, variant, and campaign params for continuity
        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set('email', normalizedEmail);
        currentParams.set('v', 'terminal'); // variant continuity

        // Ref from URL or cookies (ap_ref, ref)
        if (!currentParams.get('ref') && typeof document !== 'undefined') {
          const apRef = document.cookie.match(/ap_ref=([^;]+)/)?.[1]?.trim();
          const refCookie = document.cookie.match(/ref=([^;]+)/)?.[1]?.trim();
          const ref = apRef || refCookie;
          if (ref) currentParams.set('ref', ref);
        }

        const isTerminalProxy = typeof window !== 'undefined' && window.location.pathname.startsWith('/terminal-proxy');
        const contestUrl = isTerminalProxy
          ? `${window.location.origin}/contest?${currentParams.toString()}`
          : `/contest?${currentParams.toString()}`;
        console.log('[EmailModal] Redirecting to contest (Spec 1):', contestUrl);
        window.location.href = contestUrl;
      } else {
        let errorMessage = `Failed to log in (status ${loginRes.status})`;
        try {
          const errorData = await loginRes.json();
          console.error('[EmailModal] Login failed with response:', errorData);
          if (errorData?.error) {
            errorMessage = errorData.error;
          }
        } catch (parseErr) {
          const errorText = await loginRes.text().catch(() => '');
          console.error('[EmailModal] Login failed, response text:', errorText);
        }
        setMessage(`❌ ${errorMessage}. Please try again.`);
        setIsSubmitting(false);
      }
    } catch (loginErr) {
      console.error('[EmailModal] Login network error:', loginErr);
      console.error('[EmailModal] Error details:', {
        message: loginErr?.message,
        stack: loginErr?.stack,
        url: loginUrl,
        NEXT_BASE,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
      });
      
      // More helpful error message
      let errorMsg = `❌ Network error: ${loginErr?.message || 'Failed to connect'}`;
      if (loginErr?.message?.includes('Failed to fetch') || loginErr?.message?.includes('CORS')) {
        errorMsg += '. This might be a CORS issue. Check that the Next.js server is running and accessible.';
      }
      errorMsg += `\n\nTrying to reach: ${loginUrl}`;
      
      setMessage(errorMsg);
      setIsSubmitting(false);
    }
  };

  console.log('[EmailModal] Render - isOpen:', isOpen);
  
  if (!isOpen) {
    console.log('[EmailModal] Not rendering - isOpen is false');
    return null;
  }

  console.log('[EmailModal] Rendering modal');
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
              autoComplete="email"
              style={{
                // Part E1: Prevent iOS zoom on focus (font-size >= 16px)
                fontSize: '16px',
                WebkitAppearance: 'none',
              }}
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-green-500 text-black py-3 px-4 rounded hover:bg-green-600 transition-colors font-mono text-lg font-bold disabled:opacity-50"
          >
            {isSubmitting ? 'REQUESTING...' : 'REQUEST ACCESS'}
          </button>
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

      {/* Jody Assistant - Second IBM Terminal (Email) */}
      <JodyAssistant variant="em2" autoShowDelayMs={4000} />
    </div>
  );
};

export default EmailModal;

