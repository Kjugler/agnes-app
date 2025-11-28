'use client';

import React, { useEffect, useState } from 'react';

interface HelpModalProps {
  onClose: () => void;
}

const topics = [
  'Buying the book',
  'Contest & points',
  'Social media posting',
  'Technical issue',
  'Other',
];

export default function HelpModal({ onClose }: HelpModalProps) {
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<string>('Buying the book');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    console.log('[HelpModal] Component mounted/rendered');
    if (typeof window !== 'undefined') {
      setPageUrl(window.location.href);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !message) {
      setError('Please include your email and a short description.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          topic,
          message,
          pageUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Unexpected error');
      }

      setSent(true);
      // auto-close after a short delay
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      style={{ 
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100vw',
        height: '100vh',
        zIndex: 10004,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        margin: '0',
        boxSizing: 'border-box'
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
          maxWidth: '32rem',
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
          flexShrink: 0
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
            lineHeight: 1
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#000'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
        >
          ✕
        </button>

        {!sent ? (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem', color: '#1a1a1a' }}>
              Need help?
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1rem' }}>
              Tell us what's going on and we'll get back to you at the email you provide.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: '#1a1a1a' }}>
                  Email
                </label>
                <input
                  type="email"
                  style={{
                    width: '100%',
                    borderRadius: '0.375rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #d1d5db',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    outline: 'none',
                    color: '#1a1a1a'
                  }}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#9333ea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(147, 51, 234, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: '#1a1a1a' }}>
                  What do you need help with?
                </label>
                <select
                  style={{
                    width: '100%',
                    borderRadius: '0.375rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #d1d5db',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    outline: 'none',
                    color: '#1a1a1a',
                    cursor: 'pointer'
                  }}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#9333ea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(147, 51, 234, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {topics.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: '#1a1a1a' }}>
                  Message
                </label>
                <textarea
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    borderRadius: '0.375rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #d1d5db',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    outline: 'none',
                    color: '#1a1a1a',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us what happened, and where you got stuck."
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#9333ea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(147, 51, 234, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  required
                />
              </div>

              {error && (
                <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem' }}>
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
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    background: submitting ? '#d1d5db' : 'linear-gradient(to right, #9333ea, #d946ef)',
                    color: 'white',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!submitting) {
                      e.currentTarget.style.background = 'linear-gradient(to right, #7e22ce, #c026d3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!submitting) {
                      e.currentTarget.style.background = 'linear-gradient(to right, #9333ea, #d946ef)';
                    }
                  }}
                >
                  {submitting ? 'Sending…' : 'Send message'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div style={{ padding: '1.5rem 0' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1a1a1a' }}>
              Message sent ✅
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              Thanks for reaching out. We'll review your note and reply as soon as we can.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

