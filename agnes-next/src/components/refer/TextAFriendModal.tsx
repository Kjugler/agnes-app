'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { readContestEmail } from '@/lib/identity';
import { buildTextThisSceneSmsBody } from '@/lib/textThisScene';
import { buildScoreTextAFriendSmsBody } from '@/lib/textAFriendScore';
import {
  TEXT_A_FRIEND_BOOK_IMAGE_PATH,
  TEXT_A_FRIEND_CHAPTER9_IMAGE_PATH,
} from '@/lib/textAFriendOg';

/** Production site for SMS links; short path /t/:video expands to full attribution on the server. */
const LANDING_ORIGIN = 'https://www.theagnesprotocol.com';

/** Thumbnails for chooser (same assets as Text-a-Friend OG link previews). */
const THUMB_SHARE_MAIN_SITE = TEXT_A_FRIEND_BOOK_IMAGE_PATH;
const THUMB_SHARE_CHAPTER_9 = TEXT_A_FRIEND_CHAPTER9_IMAGE_PATH;

type TextAFriendOption = 'share_this' | 'share_scene';

function buildMessage(option: TextAFriendOption, referralCode: string | null | undefined): string {
  if (option === 'share_scene') {
    return buildTextThisSceneSmsBody(referralCode);
  }
  return buildScoreTextAFriendSmsBody(referralCode);
}

type TextAFriendModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Sender referral code → `?ref=` on /t/… so redirects preserve commission / ap_ref cookies */
  referralCode?: string | null;
};

export default function TextAFriendModal({ isOpen, onClose, referralCode }: TextAFriendModalProps) {
  const [selectedOption, setSelectedOption] = useState<TextAFriendOption>('share_this');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(buildMessage(selectedOption, referralCode));
  }, [isOpen, selectedOption, referralCode]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedOption('share_this');
    }
  }, [isOpen]);

  const handleOpenSms = () => {
    const body = message;
    const href = `sms:?body=${encodeURIComponent(body)}`;
    const email = readContestEmail();
    if (email) {
      const trackPayload = JSON.stringify({
        type: 'TEXT_FRIEND_SHARED',
        email,
        meta: { option: selectedOption },
      });
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: trackPayload,
        keepalive: true,
      }).catch(() => {});
      fetch('/api/points/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': email },
        body: JSON.stringify({ action: 'text_friend_shared' }),
        keepalive: true,
      }).catch(() => {});
    }
    window.location.href = href;
    onClose();
    setToast(true);
    window.setTimeout(() => setToast(false), 2500);
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {isOpen && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10004,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '95%',
            maxWidth: '560px',
            marginTop: 'clamp(0.5rem, 4dvh, 2rem)',
            marginBottom: '2rem',
            borderRadius: '1rem',
            backgroundColor: 'white',
            color: '#1a1a1a',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            padding: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Text a Friend</h2>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
              Choose message
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: selectedOption === 'share_this' ? '2px solid #e11d48' : '1px solid #e5e7eb',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="taf-message-option"
                  checked={selectedOption === 'share_this'}
                  onChange={() => setSelectedOption('share_this')}
                  style={{ flexShrink: 0 }}
                />
                <div
                  style={{
                    width: '104px',
                    height: '58px',
                    flexShrink: 0,
                    borderRadius: '0.375rem',
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f3f4f6',
                  }}
                >
                  <img
                    src={THUMB_SHARE_MAIN_SITE}
                    alt="Preview: main site share image"
                    width={104}
                    height={58}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Share This</span>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280', lineHeight: 1.35 }}>
                    Main site and launch link
                  </span>
                </div>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: selectedOption === 'share_scene' ? '2px solid #e11d48' : '1px solid #e5e7eb',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="taf-message-option"
                  checked={selectedOption === 'share_scene'}
                  onChange={() => setSelectedOption('share_scene')}
                  style={{ flexShrink: 0 }}
                />
                <div
                  style={{
                    width: '104px',
                    height: '58px',
                    flexShrink: 0,
                    borderRadius: '0.375rem',
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f3f4f6',
                  }}
                >
                  <img
                    src={THUMB_SHARE_CHAPTER_9}
                    alt="Preview: Chapter 9 sample read"
                    width={104}
                    height={58}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Share a Scene</span>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280', lineHeight: 1.35 }}>
                    Chapter 9 sample read
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
              Message preview
            </label>
            <textarea
              value={message}
              readOnly
              rows={10}
              spellCheck={false}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontFamily: 'system-ui, sans-serif',
                resize: 'none',
                backgroundColor: '#f9fafb',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                borderRadius: '9999px',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOpenSms}
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                borderRadius: '9999px',
                background: 'linear-gradient(to right, #e11d48, #be123c)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Open Text Message
            </button>
          </div>
        </div>
      </div>
      )}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10005,
            background: 'rgba(17, 24, 39, 0.92)',
            color: '#fff',
            padding: '0.65rem 1.25rem',
            borderRadius: 9999,
            fontSize: '0.875rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
          }}
        >
          Message ready to send
        </div>
      )}
    </>,
    document.body
  );
}
