'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type ReviewComposerProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

type SubmitState = 'idle' | 'submitting' | 'approved' | 'held' | 'error';

export default function ReviewComposer({ isOpen, onClose, onSubmitted }: ReviewComposerProps) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setRating(0);
    setText('');
    setSubmitState('idle');
    setError(null);
  };

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setSubmitState('submitting');

    try {
      const res = await fetch('/api/reviews/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating, text: text.trim() }),
      });

      const result = await res.json();

      // Defensive response handling: check for ok and status
      if (!res.ok || !result?.ok || !result?.status) {
        setSubmitState('error');
        setError('Something went wrong. Please try again.');
        return;
      }

      // Handle status explicitly
      const status = result.status ?? 'ERROR';

      if (status === 'HELD') {
        setSubmitState('held');
      } else if (status === 'APPROVED') {
        setSubmitState('approved');
        // Reset form
        setText('');
        setRating(0);
        // Notify parent and close
        onSubmitted();
        setTimeout(() => {
          onClose();
        }, 100);
      } else {
        // Unknown status - treat as error
        setSubmitState('error');
        setError('Something went wrong. Please try again.');
      }
    } catch (err: any) {
      // Never show raw error messages
      setSubmitState('error');
      setError('Something went wrong. Please try again.');
    }
  };

  const isValid = text.trim().length >= 3 && text.trim().length <= 240 && rating > 0;
  const canSubmit = isValid && submitState === 'idle';
  const isDisabled = submitState === 'held' || submitState === 'submitting' || submitState === 'approved';

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => {
          resetForm();
          onClose();
        }}
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
            Write a Review
          </h2>
          <p
            style={{
              fontSize: '0.9em',
              color: '#888',
              marginBottom: '1.5rem',
            }}
          >
            Share your experience — don't quote the book.
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
                Review received
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

          {submitState === 'error' && error && (
            <div
              style={{
                backgroundColor: '#0a0e27',
                border: '1px solid rgba(255,107,107,0.25)',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  color: '#ff6b6b',
                  fontSize: '1em',
                  fontWeight: 'bold',
                  marginBottom: '0.25rem',
                }}
              >
                Something went wrong
              </div>
              <div
                style={{
                  color: '#bbb',
                  fontSize: '0.9em',
                }}
              >
                {error}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Star Rating */}
            <div
              style={{
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.9em',
                  color: '#888',
                  marginBottom: '0.5rem',
                }}
              >
                Rating
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                }}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    disabled={isDisabled}
                    style={{
                      fontSize: '24px',
                      background: 'none',
                      border: 'none',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      color: star <= rating ? '#ffcc00' : '#444',
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

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
                onClick={() => {
                  resetForm();
                  onClose();
                }}
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
                {submitState === 'held' || submitState === 'error' ? 'Close' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitState === 'submitting' || submitState === 'held' || submitState === 'approved'}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: submitState === 'error' || (isValid && submitState === 'idle') ? '#00ffe0' : '#1a1f3a',
                  border: submitState === 'error' || (isValid && submitState === 'idle') ? '1px solid #00ffe0' : '1px solid #2a3a4a',
                  borderRadius: '4px',
                  color: submitState === 'error' || (isValid && submitState === 'idle') ? '#000' : '#666',
                  cursor: submitState === 'error' || (isValid && submitState === 'idle') ? 'pointer' : 'not-allowed',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '0.9em',
                  fontWeight: 'bold',
                }}
              >
                {submitState === 'submitting' 
                  ? 'Submitting...' 
                  : submitState === 'held' || submitState === 'approved'
                  ? 'Submitted'
                  : submitState === 'error'
                  ? 'Try Again'
                  : 'Submit Review'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

