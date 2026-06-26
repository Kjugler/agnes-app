'use client';

import React, { useState, useEffect } from 'react';
import ReferFriendModal from './ReferFriendModal';
import '@/styles/button-glow.css';

interface ReferFriendButtonProps {
  referralCode: string; // personal code for the current user
  referrerEmail?: string; // referrer's email for Reply-To
  className?: string;
  label?: string;
  onRequireEmail?: () => void;
  onReferralSent?: () => void | Promise<void>; // Callback after successful referral send
}

export default function ReferFriendButton({
  referralCode,
  referrerEmail,
  className = '',
  label = 'Share with Friends',
  onRequireEmail,
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

  const handleClick = () => {
    if (!referrerEmail) {
      onRequireEmail?.();
      return;
    }
    if (resolvedCode) {
      setIsOpen(true);
    }
  };

  return (
    <>
      <div className="refer-friend-stack" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={Boolean(referrerEmail) && (!resolvedCode || loadingCode)}
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
            background: !referrerEmail || resolvedCode ? '#ea580c' : '#666666',
            outline: 'none',
            border: 'none',
            textDecoration: 'none',
            cursor: !referrerEmail || resolvedCode ? 'pointer' : 'not-allowed',
            opacity: referrerEmail && loadingCode ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!referrerEmail || resolvedCode) {
              e.currentTarget.style.background = '#c2410c';
            }
          }}
          onMouseLeave={(e) => {
            if (!referrerEmail || resolvedCode) {
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
            {label}
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
        
        {/* Explanation panel — hidden in score mobile rail via score.css */}
        <div
          className="refer-friend-explanation"
          style={{
          fontSize: '11px',
          lineHeight: 1.4,
          textAlign: 'center',
          maxWidth: '200px',
          padding: '0 8px',
        }}
        >
          <div style={{ marginBottom: '4px', fontWeight: 600 }}>How this works</div>
          <div style={{ fontSize: '10px', opacity: 0.9 }}>
            Send friends a private email with your sample-chapters link and reader discount.
            <br />
            They save on the book; you earn $2 when they purchase using your code.
          </div>
          <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 500, opacity: 0.95 }}>
            Most reader referrals happen in the first few months — start sharing now.
          </div>
        </div>
      </div>

      {isOpen && resolvedCode && referrerEmail && (
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

