'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type ReplyModalProps = {
  isOpen: boolean;
  signalId: string;
  onClose: () => void;
};

type SubmitState = 'idle' | 'submitting' | 'approved' | 'held' | 'error';

export default function ReplyModal({ isOpen, signalId, onClose }: ReplyModalProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setText('');
      setSubmitState('idle');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitState('submitting');

    try {
      const response = await fetch('/api/signal/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signalId, text: text.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create reply');
      }

      if (data.ok) {
        if (data.status === 'APPROVED') {
          // Close modal and refresh
          setSubmitState('approved');
          setText('');
          onClose();
          router.refresh();
        } else if (data.status === 'HELD') {
          // Show pending message, don't refresh
          setSubmitState('held');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setSubmitState('error');
    }
  };

  const isValid = text.trim().length >= 3 && text.trim().length <= 240;
  const canSubmit = isValid && submitState === 'idle';
  const isDisabled = submitState === 'held' || submitState === 'submitting' || submitState === 'approved';

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#14192e',
            border: '1px solid #1a1f3a',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            color: '#e0e0e0',
            fontFamily: '"Courier New", monospace',
          }}
        >
          <h2
            style={{
              fontSize: '1.5em',
              marginBottom: '0.5rem',
              color: '#00ffe0',
            }}
          >
            Reply to Signal
          </h2>
          <p
            style={{
              fontSize: '0.9em',
              color: '#888',
              marginBottom: '1.5rem',
            }}
          >
            Describe your experience — don't quote the book.
          </p>

          {submitState === 'held' && (
            <div
              style={{
                backgroundColor: '#0a0e27',
                border: '1px solid rgba(0,255,224,0.25)',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  color: '#00ffe0',
                  fontSize: '1em',
                  fontWeight: 'bold',
                  marginBottom: '0.25rem',
                }}
              >
                Reply received
              </div>
              <div
                style={{
                  color: '#bbb',
                  fontSize: '0.9em',
                }}
              >
                Pending review. It will appear once approved.
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                backgroundColor: '#4a2a2a',
                border: '1px solid #8a4a4a',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
                color: '#ff6b6b',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder="What did it make you feel? Keep it experience-based."
              maxLength={240}
              disabled={isDisabled}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '0.75rem',
                backgroundColor: '#0a0e27',
                border: '1px solid #1a1f3a',
                borderRadius: '4px',
                color: isDisabled ? '#666' : '#e0e0e0',
                fontFamily: '"Courier New", monospace',
                fontSize: '0.95em',
                resize: 'vertical',
                marginBottom: '0.5rem',
                cursor: isDisabled ? 'not-allowed' : 'text',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.85em',
                  color: text.length > 240 ? '#ff6b6b' : '#888',
                }}
              >
                {text.length}/240
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={submitState === 'submitting'}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#1a1f3a',
                  border: '1px solid #2a3a4a',
                  borderRadius: '4px',
                  color: '#e0e0e0',
                  cursor: submitState === 'submitting' ? 'not-allowed' : 'pointer',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '0.9em',
                }}
              >
                {submitState === 'held' ? 'Close' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isDisabled}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: canSubmit && !isDisabled ? '#00ffe0' : '#1a1f3a',
                  border: canSubmit && !isDisabled ? '1px solid #00ffe0' : '1px solid #2a3a4a',
                  borderRadius: '4px',
                  color: canSubmit && !isDisabled ? '#000' : '#666',
                  cursor: canSubmit && !isDisabled ? 'pointer' : 'not-allowed',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '0.9em',
                  fontWeight: 'bold',
                }}
              >
                {submitState === 'submitting' ? 'Sending...' : submitState === 'held' ? 'Submitted' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

