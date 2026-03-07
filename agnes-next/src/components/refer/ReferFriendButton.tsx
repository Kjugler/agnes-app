'use client';

import React, { useState, useEffect } from 'react';
import ReferFriendModal from './ReferFriendModal';
import '@/styles/button-glow.css';

interface ReferFriendButtonProps {
  referralCode: string; // personal code for the current user
  referrerEmail?: string; // referrer's email for Reply-To
  className?: string;
  onReferralSent?: () => void | Promise<void>; // Callback after successful referral send
}

export default function ReferFriendButton({
  referralCode,
  referrerEmail,
  className = '',
  onReferralSent,
}: ReferFriendButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [resolvedCode, setResolvedCode] = useState(referralCode);

  // Fetch current referral code from deepquill once when email is available
  // Only depend on referrerEmail to avoid infinite loops
  useEffect(() => {
    if (!referrerEmail) return;
    
    // If we already have a code from props and it's not empty, use it initially
    // but still fetch fresh code in background
    if (referralCode) {
      setResolvedCode(referralCode);
    }
    
    let cancelled = false;
    setLoadingCode(true);
    
    fetch('/api/associate/status', {
      headers: { 'X-User-Email': referrerEmail },
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.code) {
          // Always use the code from deepquill (canonical source)
          setResolvedCode(data.code);
        }
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[ReferFriendButton] Failed to fetch referral code', err);
        // Keep existing resolvedCode on error
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCode(false);
        }
      });
    
    return () => {
      cancelled = true;
    };
  }, [referrerEmail]); // Only depend on referrerEmail to prevent loops

  // Show button even if code is loading (will be disabled until code loads)
  if (!referrerEmail) {
    return null; // Don't show button if no email
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => {
            if (resolvedCode) {
              setIsOpen(true);
            }
          }}
          disabled={!resolvedCode || loadingCode}
          className={`button-glow button-glow--orange ${className}`}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '96px',
            borderRadius: 16,
            padding: '0 24px',
            color: '#fff',
            background: resolvedCode ? '#ea580c' : '#666666',
            outline: 'none',
            border: 'none',
            textDecoration: 'none',
            cursor: resolvedCode ? 'pointer' : 'not-allowed',
            opacity: loadingCode ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (resolvedCode) {
              e.currentTarget.style.background = '#c2410c';
            }
          }}
          onMouseLeave={(e) => {
            if (resolvedCode) {
              e.currentTarget.style.background = '#ea580c';
            }
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'clamp(18px, 2vw, 24px)',
            fontWeight: 800,
          }}>
            Refer a Friend
          </div>
          <div style={{
            fontSize: 14,
            lineHeight: 1,
            color: 'rgba(255,255,255,0.9)',
            marginTop: 4,
          }}>
            $2 each
          </div>
        </button>
        
        {/* Explanation panel */}
        <div style={{
          fontSize: '11px',
          lineHeight: 1.4,
          color: 'rgba(255,255,255,0.85)',
          textAlign: 'center',
          maxWidth: '200px',
          padding: '0 8px',
        }}>
          <div style={{ marginBottom: '4px', fontWeight: 600 }}>How this works</div>
          <div style={{ fontSize: '10px', opacity: 0.9 }}>
            Send friends a private email with your discount link. They save $3.90. You earn $2 per purchase.
            <br />
            Plus: 5 pts per email (up to 20 emails / 100 pts per day).
          </div>
          <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 500, opacity: 0.95 }}>
            ⏰ Most purchases happen in the first 4 months—start sharing now!
          </div>
        </div>
      </div>

      {isOpen && resolvedCode && (
        <ReferFriendModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          referralCode={resolvedCode}
          referrerEmail={referrerEmail}
          onReferralSent={onReferralSent}
        />
      )}
    </>
  );
}

