// deepquill/src/components/EmailModal.jsx
import React, { useState } from 'react';
import { subscribeEmail } from '../api/subscribeEmail';
import JodyAssistant from './JodyAssistant';
import './TerminalEmulator.css';

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
    // Priority: env var > current origin (if ngrok) > localhost (if local) > ngrok fallback
    let NEXT_BASE = null;
    
    // Check env var first (should be ngrok URL in dev)
    const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AGNES_BASE_URL : null;
    if (envUrl) {
      NEXT_BASE = envUrl;
      console.log('[deepquill] Using env var:', envUrl);
    } else if (typeof window !== 'undefined') {
      // Check if we're already on ngrok (use current origin)
      if (window.location.hostname.includes('ngrok') || window.location.hostname.includes('ngrok-free.app')) {
        NEXT_BASE = `${window.location.protocol}//${window.location.host}`;
        console.log('[deepquill] Using current ngrok origin:', NEXT_BASE);
      } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Running locally - use localhost with agnes-next port (3002, not 5173)
        NEXT_BASE = 'http://localhost:3002';
        console.log('[deepquill] Using localhost (local dev):', NEXT_BASE);
      } else {
        // Fallback to hardcoded ngrok (for dev testing)
        NEXT_BASE = 'https://agnes-dev.ngrok-free.app';
        console.log('[deepquill] Using ngrok fallback:', NEXT_BASE);
      }
    } else {
      // Server-side fallback
      NEXT_BASE = 'http://localhost:3002';
      console.log('[deepquill] Using localhost fallback (server-side):', NEXT_BASE);
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
          meta: { path: '/' }, // Root entry point - split will determine final route
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
        
        // Redirect to Lightning page (Terminal 2 → Lightning → Contest flow)
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
        console.log('[EmailModal] Redirecting to Lightning (Terminal 2 → Lightning → Contest):', lighteningUrl);
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
    <div className="terminal-container" style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'var(--terminal-background)', color: 'var(--terminal-text)' }}>
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '2rem',
        backgroundColor: 'var(--terminal-background)', 
        color: 'var(--terminal-text)',
        position: 'relative',
        overflow: 'auto'
      }}>
        {/* Main Content Container - Centered */}
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontFamily: 'monospace', 
            marginBottom: '1rem', 
            color: 'var(--terminal-text)',
            textAlign: 'center'
          }}>
            Access Granted
          </h2>

          {/* Two Column Layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '3rem',
            width: '100%',
            maxWidth: '1000px',
            alignItems: 'start'
          }}>
            {/* Left Column - Email Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontFamily: 'monospace', 
                    marginBottom: '0.5rem', 
                    color: 'var(--terminal-text)',
                    fontSize: '1rem'
                  }}>
                    Request access to the redacted chapter
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem 1rem', 
                      fontFamily: 'monospace',
                      fontSize: '1rem',
                      backgroundColor: '#000', 
                      color: 'var(--terminal-text)', 
                      border: '1px solid var(--terminal-text)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {message && (
                  <p style={{ 
                    fontSize: '0.875rem', 
                    fontFamily: 'monospace',
                    color: message.startsWith('✅') ? 'var(--terminal-text)' : '#ef4444',
                    margin: 0
                  }}>
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem 1rem', 
                    fontFamily: 'monospace', 
                    fontSize: '1rem', 
                    fontWeight: 'bold',
                    backgroundColor: 'var(--terminal-text)', 
                    color: '#000',
                    border: 'none',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.5 : 1
                  }}
                >
                  {isSubmitting ? 'REQUESTING...' : 'REQUEST ACCESS'}
                </button>
              </form>
            </div>

            {/* Right Column - Access Report */}
            <div style={{ 
              padding: '1.5rem', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1rem'
            }}>
              <h3 style={{ 
                fontFamily: 'monospace', 
                fontSize: '1.125rem', 
                marginBottom: '1rem', 
                color: 'var(--terminal-text)',
                margin: 0
              }}>
                ACCESS REPORT
              </h3>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem', 
                fontFamily: 'monospace', 
                color: 'var(--terminal-text)', 
                opacity: 0.8 
              }}>
                <p style={{ margin: 0 }}>Protocol Visitors: 413,128</p>
                <p style={{ margin: 0 }}>Redacted Chapter Requests: 171,927</p>
                <p style={{ margin: 0 }}>Clearance Rate: 41.6%</p>
              </div>
              <p style={{ 
                marginTop: '1rem', 
                fontFamily: 'monospace', 
                fontStyle: 'italic', 
                color: 'var(--terminal-text)', 
                opacity: 0.6,
                margin: 0
              }}>
                "Only the discerning make it through."
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ 
              marginTop: '1rem', 
              fontSize: '0.875rem', 
              fontFamily: 'monospace',
              color: 'var(--terminal-text)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Jody Assistant - Second IBM Terminal (Email) */}
      <JodyAssistant variant="em2" autoShowDelayMs={4000} />
    </div>
  );
};

export default EmailModal;

