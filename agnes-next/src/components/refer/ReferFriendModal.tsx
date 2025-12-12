'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';

interface ReferFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  referralCode: string;
  referrerEmail?: string;
  onReferralSent?: () => void | Promise<void>; // Callback after successful referral send
}

export default function ReferFriendModal({
  isOpen,
  onClose,
  referralCode,
  referrerEmail,
  onReferralSent,
}: ReferFriendModalProps) {
  const [friendEmailsRaw, setFriendEmailsRaw] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState<ReferVideoId>('fb1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pointsInfo, setPointsInfo] = useState<{
    pointsAwarded: number;
    daily: {
      emailsSentToday: number;
      pointsFromEmailsToday: number;
      maxEmailsPerDay: number;
      maxPointsPerDay: number;
    };
  } | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setFriendEmailsRaw('');
      setSelectedVideoId('fb1');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Parse multiple emails
    const raw = friendEmailsRaw || '';
    const emails = raw
      .split(/[,\n;]/)
      .map((e) => e.trim())
      .filter(Boolean);

    // Validation
    if (emails.length === 0) {
      setError('Please enter at least one email address.');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.filter((e) => !emailRegex.test(e));
    if (invalid.length > 0) {
      setError(
        `These don't look like valid emails: ${invalid.join(', ')}. Please fix and try again.`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/refer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendEmails: emails,
          videoId: selectedVideoId,
          referralCode,
          referrerEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send referral');
      }

      setSuccess(true);
      setPointsInfo({
        pointsAwarded: data.pointsAwarded || 0,
        daily: data.daily || {
          emailsSentToday: emails.length,
          pointsFromEmailsToday: data.pointsAwarded || 0,
          maxEmailsPerDay: 20,
          maxPointsPerDay: 100,
        },
      });
      setFriendEmailsRaw('');

      // Refresh score after successful referral send
      if (onReferralSent) {
        try {
          await onReferralSent();
        } catch (err) {
          console.error('[ReferFriendModal] Error refreshing score:', err);
        }
      }

      // Auto-close after 5 seconds (longer to read feedback)
      setTimeout(() => {
        onClose();
      }, 5000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 10004,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        margin: 0,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '95%',
          maxWidth: '600px',
          margin: '0 auto',
          borderRadius: '1rem',
          backgroundColor: 'white',
          color: '#1a1a1a',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          padding: '1.5rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 10005,
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            right: '1rem',
            top: '0.75rem',
            fontSize: '0.875rem',
            color: '#666',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#000')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
        >
          ✕
        </button>

        {success ? (
          <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: '#1a1a1a',
              }}
            >
              Referral email(s) sent! ✅
            </h2>
            {pointsInfo && pointsInfo.pointsAwarded > 0 ? (
              <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                <p style={{ marginBottom: '0.5rem' }}>
                  You earned <strong>{pointsInfo.pointsAwarded} points</strong> from this send.
                </p>
                <p style={{ fontSize: '0.75rem', color: '#888' }}>
                  Today's total from emails: <strong>{pointsInfo.daily.pointsFromEmailsToday}/{pointsInfo.daily.maxPointsPerDay} points</strong> ({pointsInfo.daily.emailsSentToday}/{pointsInfo.daily.maxEmailsPerDay} emails)
                </p>
                <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
                  You'll earn $2 when your friends buy the book.
                </p>
              </div>
            ) : (
              <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                <p style={{ marginBottom: '0.5rem' }}>
                  You've already reached today's referral email limit for points, but you can still earn $2 per purchase when people use your code.
                </p>
                {pointsInfo && (
                  <p style={{ fontSize: '0.75rem', color: '#888' }}>
                    Today: {pointsInfo.daily.pointsFromEmailsToday}/{pointsInfo.daily.maxPointsPerDay} points ({pointsInfo.daily.emailsSentToday}/{pointsInfo.daily.maxEmailsPerDay} emails)
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
                color: '#1a1a1a',
              }}
            >
              Refer a Friend
            </h2>
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Earn points and cash</p>
              <p style={{ marginBottom: '0.25rem' }}>
                • 5 points for each valid email you send (up to 20 per day)
              </p>
              <p style={{ marginBottom: '0.25rem' }}>
                • Max 100 points per day from emails
              </p>
              <p style={{ marginBottom: '0.25rem' }}>
                • Your friends save $3.90 on their book
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                • You earn $2.00 for every purchase using your code
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Email Input */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                    color: '#1a1a1a',
                  }}
                >
                  Friends' Emails (comma-separated)
                </label>
                <input
                  type="text"
                  value={friendEmailsRaw}
                  onChange={(e) => setFriendEmailsRaw(e.target.value)}
                  placeholder="friend1@example.com, friend2@example.com"
                  style={{
                    width: '100%',
                    borderRadius: '0.375rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #d1d5db',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    outline: 'none',
                    color: '#1a1a1a',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#9333ea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(147, 51, 234, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <p
                  style={{
                    marginTop: '0.25rem',
                    fontSize: '0.75rem',
                    color: '#666',
                  }}
                >
                  You can enter more than one email. Separate addresses with commas or semicolons.
                </p>
              </div>

              {/* Video Selection */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    color: '#1a1a1a',
                  }}
                >
                  Choose a Video
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {REFER_VIDEOS.map((video) => (
                    <div
                      key={video.id}
                      onClick={() => setSelectedVideoId(video.id)}
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: `2px solid ${selectedVideoId === video.id ? '#9333ea' : '#e5e7eb'}`,
                        backgroundColor: selectedVideoId === video.id ? '#faf5ff' : '#f9fafb',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedVideoId !== video.id) {
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedVideoId !== video.id) {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                        }
                      }}
                    >
                      <div
                        style={{
                          width: '80px',
                          height: '60px',
                          borderRadius: '0.375rem',
                          overflow: 'hidden',
                          flexShrink: 0,
                          backgroundColor: '#e5e7eb',
                        }}
                      >
                        <img
                          src={video.thumbnailSrc}
                          alt={video.label}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedVideoId === video.id}
                            onChange={() => setSelectedVideoId(video.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 600,
                              color: '#1a1a1a',
                            }}
                          >
                            {video.label}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: '0.75rem',
                            color: '#666',
                            marginLeft: '1.5rem',
                          }}
                        >
                          {video.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Text */}
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  color: '#666',
                }}
              >
                We'll send a short email from you with this video and your personal referral
                link.
              </div>

              {/* Error Message */}
              {error && (
                <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</div>
              )}

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                  paddingTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    borderRadius: '9999px',
                    backgroundColor: '#f3f4f6',
                    color: '#1a1a1a',
                    border: '1px solid #d1d5db',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    background: isSubmitting
                      ? '#d1d5db'
                      : 'linear-gradient(to right, #9333ea, #d946ef)',
                    color: 'white',
                    border: 'none',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.background =
                        'linear-gradient(to right, #7e22ce, #c026d3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.background =
                        'linear-gradient(to right, #9333ea, #d946ef)';
                    }
                  }}
                >
                  {isSubmitting ? 'Sending…' : 'Send Referral'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

