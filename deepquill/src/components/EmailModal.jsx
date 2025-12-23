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
    // Priority: env var (ngrok) > ngrok fallback > localhost (only if no ngrok available)
    let NEXT_BASE = null;
    
    // Check env var first (should be ngrok URL in dev)
    const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AGNES_BASE_URL : null;
    if (envUrl) {
      NEXT_BASE = envUrl;
      console.log('[deepquill] Using env var (ngrok):', envUrl);
    } else {
      // Check if we're already on ngrok (use current origin)
      if (typeof window !== 'undefined' && (window.location.hostname.includes('ngrok') || window.location.hostname.includes('ngrok-free.app'))) {
        NEXT_BASE = `${window.location.protocol}//${window.location.host}`;
        console.log('[deepquill] Using current ngrok origin:', NEXT_BASE);
      } else {
        // Fallback to hardcoded ngrok (for dev testing)
        NEXT_BASE = 'https://agnes-dev.ngrok-free.app';
        console.log('[deepquill] Using ngrok fallback:', NEXT_BASE);
      }
    }
    
    // Debug: log what URL we're using
    console.log('[deepquill] NEXT_BASE determined:', {
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
      port: typeof window !== 'undefined' ? window.location.port : 'unknown',
      final: NEXT_BASE,
    });

    // Fire tracking event (non-blocking)
    try {
      fetch(`${NEXT_BASE}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CONTEST_ENTERED',
          email,
          source: 'contest',
          ref: new URLSearchParams(location.search).get('ref') || undefined,
          meta: { path: '/lightening' },
        }),
      }).catch(() => {});
    } catch {}

    // Call /api/contest/login to set session cookie, then redirect
    const normalizedEmail = email.trim().toLowerCase();
    const loginUrl = `${NEXT_BASE}/api/contest/login`;
    console.log('[EmailModal] Calling /api/contest/login', {
      email: normalizedEmail,
      url: loginUrl,
      NEXT_BASE,
    });
    
    try {
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
        credentials: 'include',
      });

      console.log('[EmailModal] Login response status:', loginRes.status, loginRes.statusText);

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
        
        // Redirect to /lightening first (correct sequence: Terminal 1 → Terminal 2 → Lightning → Contest)
        // Preserve existing query params and add email
        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set('email', normalizedEmail);
        
        // Preserve tracking params if present
        const trackingParams = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
        trackingParams.forEach(key => {
          const value = currentParams.get(key);
          if (value) {
            currentParams.set(key, value);
          }
        });
        
        const lighteningUrl = `${NEXT_BASE}/lightening?${currentParams.toString()}`;
        console.log('[EmailModal] Redirecting to lightening with email:', lighteningUrl);
        // Redirect immediately - no delay needed
        window.location.href = lighteningUrl;
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

