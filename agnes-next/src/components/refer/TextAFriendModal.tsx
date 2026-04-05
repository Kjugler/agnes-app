'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';
import { readContestEmail } from '@/lib/identity';

/** Production site for SMS links; short path /t/:video expands to full attribution on the server. */
const LANDING_ORIGIN = 'https://www.theagnesprotocol.com';

function buildLandingUrl(videoId: ReferVideoId, referralCode: string | null | undefined): string {
  const path = `${LANDING_ORIGIN}/t/${videoId}`;
  const code = referralCode?.trim();
  if (!code) return path;
  const u = new URL(path);
  u.searchParams.set('ref', code);
  return u.toString();
}

function buildDefaultMessage(landingUrl: string): string {
  return `Hey—this showed up today.

Not sure what it is yet, but it's actually pretty interesting.

Go in and tell me what you think.

${landingUrl}`;
}

type TextAFriendModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Sender referral code → `?ref=` on /t/… so redirects preserve commission / ap_ref cookies */
  referralCode?: string | null;
};

export default function TextAFriendModal({ isOpen, onClose, referralCode }: TextAFriendModalProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<ReferVideoId>('fb1');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(buildDefaultMessage(buildLandingUrl(selectedVideoId, referralCode)));
  }, [isOpen, selectedVideoId, referralCode]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedVideoId('fb1');
    }
  }, [isOpen]);

  const handleOpenSms = () => {
    const body = message;
    const href = `sms:?body=${encodeURIComponent(body)}`;
    const email = readContestEmail();
    if (email) {
      const trackPayload = JSON.stringify({ type: 'TEXT_FRIEND_SHARED', email });
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
          <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0 0 1rem', lineHeight: 1.45 }}>
            Pick a video for their visit after they tap your link (no video file is sent by SMS).
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
              Video for on-site experience
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {REFER_VIDEOS.map((video) => (
                <label
                  key={video.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: selectedVideoId === video.id ? '2px solid #e11d48' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="taf-video"
                    checked={selectedVideoId === video.id}
                    onChange={() => setSelectedVideoId(video.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{video.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{video.description}</div>
                  </div>
                  <img
                    src={video.thumbnailSrc}
                    alt=""
                    width={72}
                    height={54}
                    style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
              Message preview (editable)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              spellCheck
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontFamily: 'system-ui, sans-serif',
                resize: 'vertical',
              }}
            />
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.4rem 0 0', fontStyle: 'italic' }}>
              Feel free to personalize this before sending.
            </p>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0.35rem 0 0' }}>
              Short link <code style={{ fontSize: '0.65rem' }}>/t/fb1?ref=…</code> expands to full tracking (source, video,
              discount, your referral code). No video file is sent in the text.
            </p>
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
