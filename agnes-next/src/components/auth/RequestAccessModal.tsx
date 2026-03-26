'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RequestAccessModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  redirectTo?: string; // Default: '/contest'
}

export default function RequestAccessModal({
  isOpen,
  onClose,
  onSuccess,
  redirectTo = '/contest',
}: RequestAccessModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  
  // Validation: disable button until email contains @
  const isValidEmail = email.includes('@') && email.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    const normalizedEmail = email.trim().toLowerCase();
    
    try {
      // POST /api/contest/login with credentials
      const loginRes = await fetch('/api/contest/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
        credentials: 'include', // Include cookies for CORS
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        console.log('[RequestAccessModal] Login successful:', loginData);
        
        // Clear any old localStorage data to ensure fresh start
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('contest_email');
            window.localStorage.removeItem('user_email');
            window.localStorage.removeItem('associate_email');
            console.log('[RequestAccessModal] Cleared old localStorage data');
          }
        } catch (e) {
          console.warn('[RequestAccessModal] Could not clear localStorage', e);
        }
        
        // Reset form state
        setEmail('');
        setIsSubmitting(false);
        
        // Success callback or redirect
        if (onSuccess) {
          onSuccess();
        } else {
          // C: Redirect to /contest (or custom redirectTo)
          router.replace(redirectTo);
        }
      } else {
        let errorMessage = `Failed to log in (status ${loginRes.status})`;
        try {
          const errorData = await loginRes.json();
          console.error('[RequestAccessModal] Login failed with response:', errorData);
          if (errorData?.error) {
            errorMessage = errorData.error;
          }
        } catch (parseErr) {
          const errorText = await loginRes.text().catch(() => '');
          console.error('[RequestAccessModal] Login failed, response text:', errorText);
        }
        setMessage(`❌ ${errorMessage}. Please try again.`);
        setIsSubmitting(false);
      }
    } catch (loginErr) {
      console.error('[RequestAccessModal] Login network error:', loginErr);
      const errorMsg = `❌ Network error: ${loginErr instanceof Error ? loginErr.message : 'Failed to connect'}`;
      setMessage(errorMsg);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        border: '2px solid #00ffe0',
        borderRadius: '12px',
        padding: '2.5rem',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 0 30px rgba(0, 255, 224, 0.3), inset 0 0 20px rgba(0, 255, 224, 0.05)',
        position: 'relative',
      }}>
        {/* Glitch border effect */}
        <div style={{
          position: 'absolute',
          inset: 0,
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: '12px',
          pointerEvents: 'none',
          animation: 'pulse 2s ease-in-out infinite',
        }} />

        {/* Header */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <h2 style={{
            color: '#00ffe0',
            fontSize: '1.8rem',
            fontWeight: 'bold',
            margin: 0,
            marginBottom: '0.5rem',
            textShadow: '0 0 10px rgba(0, 255, 224, 0.5)',
            fontFamily: "'Courier New', monospace",
          }}>
            IDENTIFY YOURSELF
          </h2>
          <p style={{
            color: 'rgba(255, 0, 0, 0.8)',
            fontSize: '0.85rem',
            margin: 0,
            fontFamily: "'Courier New', monospace",
          }}>
            CLEARANCE REQUIRED
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{
              display: 'block',
              color: '#00ffe0',
              fontSize: '0.9rem',
              marginBottom: '0.75rem',
              fontFamily: "'Courier New', monospace",
            }}>
              Enter your email to continue
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: '#00ffe0',
                border: '1px solid #00ffe0',
                borderRadius: '6px',
                fontSize: '16px', // Prevent iOS zoom
                fontFamily: "'Courier New', monospace",
                outline: 'none',
                transition: 'all 0.2s',
                WebkitAppearance: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#00ffe0';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 224, 0.3)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#00ffe0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <p style={{
              color: 'rgba(0, 255, 224, 0.6)',
              fontSize: '0.75rem',
              marginTop: '0.5rem',
              marginBottom: 0,
              fontFamily: "'Courier New', monospace",
            }}>
              We'll use this to restore your session and bring you back to your score.
            </p>
          </div>

          {message && (
            <p style={{
              fontSize: '0.85rem',
              fontFamily: "'Courier New', monospace",
              margin: 0,
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: message.startsWith('✅') 
                ? 'rgba(0, 255, 224, 0.1)' 
                : 'rgba(255, 0, 0, 0.1)',
              color: message.startsWith('✅') ? '#00ffe0' : '#ff4444',
              border: `1px solid ${message.startsWith('✅') ? '#00ffe0' : '#ff4444'}`,
            }}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !isValidEmail}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: isValidEmail && !isSubmitting ? 'rgba(0, 255, 224, 0.1)' : 'rgba(0, 0, 0, 0.5)',
              color: '#00ffe0',
              border: `2px solid ${isValidEmail && !isSubmitting ? '#00ffe0' : 'rgba(0, 255, 224, 0.3)'}`,
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: 'bold',
              fontFamily: "'Courier New', monospace",
              cursor: isValidEmail && !isSubmitting ? 'pointer' : 'not-allowed',
              opacity: isValidEmail && !isSubmitting ? 1 : 0.5,
              transition: 'all 0.2s',
              textShadow: isValidEmail && !isSubmitting ? '0 0 8px rgba(0, 255, 224, 0.5)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (isValidEmail && !isSubmitting) {
                e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.2)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 224, 0.4)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (isValidEmail && !isSubmitting) {
                e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            {isSubmitting ? 'CHECKING...' : isValidEmail ? 'ENTER' : 'ENTER EMAIL'}
          </button>
        </form>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginTop: '1.5rem',
              color: 'rgba(0, 255, 224, 0.6)',
              fontSize: '0.85rem',
              fontFamily: "'Courier New', monospace",
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#00ffe0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(0, 255, 224, 0.6)';
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Add pulse animation for glitch border */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0%, 100% {
              opacity: 0.3;
            }
            50% {
              opacity: 0.6;
            }
          }
        `
      }} />
    </div>
  );
}
