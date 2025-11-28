'use client';

import React, { useState } from 'react';
import ReferFriendModal from './ReferFriendModal';

interface ReferFriendButtonProps {
  referralCode: string; // personal code for the current user
  referrerEmail?: string; // referrer's email for Reply-To
  className?: string;
}

export default function ReferFriendButton({
  referralCode,
  referrerEmail,
  className = '',
}: ReferFriendButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!referralCode) {
    return null; // Don't show button if no referral code
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '96px',
          borderRadius: 16,
          padding: '0 24px',
          color: '#fff',
          background: '#ea580c',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
          transform: 'scale(1)',
          outline: 'none',
          border: 'none',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#c2410c';
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#ea580c';
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        }}
        className={className}
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

      {isOpen && (
        <ReferFriendModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          referralCode={referralCode}
          referrerEmail={referrerEmail}
        />
      )}
    </>
  );
}

