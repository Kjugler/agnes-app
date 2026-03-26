'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type ReviewForEdit = {
  id: string;
  rating: number;
  text: string;
};

type EditReviewModalProps = {
  isOpen: boolean;
  review: ReviewForEdit | null;
  onClose: () => void;
  onSuccess?: (updated: Partial<ReviewForEdit>) => void;
};

export default function EditReviewModal({ isOpen, review, onClose, onSuccess }: EditReviewModalProps) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && review) {
      setRating(review.rating);
      setText(review.text);
      setError(null);
    }
  }, [isOpen, review]);

  if (!isOpen || !review) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rating, text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      onSuccess?.({ id: review.id, rating, text: text.trim() });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = text.trim().length >= 3 && text.trim().length <= 240;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 9998,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(90vw, 400px)',
          backgroundColor: '#14192e',
          border: '1px solid #1a1f3a',
          borderRadius: 8,
          padding: '1.5rem',
          zIndex: 9999,
        }}
      >
        <h3 style={{ margin: '0 0 1rem', color: '#00ffe0', fontSize: '1.1rem' }}>Edit Review</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', color: '#888', fontSize: '0.85em', marginBottom: '0.25rem' }}>Rating (1–5)</label>
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0a0e27',
                border: '1px solid #1a1f3a',
                borderRadius: 4,
                color: '#e0e0e0',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {'★'.repeat(r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#888', fontSize: '0.85em', marginBottom: '0.25rem' }}>
              Text (3–240 chars)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0a0e27',
                border: '1px solid #1a1f3a',
                borderRadius: 4,
                color: '#e0e0e0',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {error && <div style={{ color: '#ff6b6b', fontSize: '0.9em' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid #1a1f3a',
                borderRadius: 4,
                color: '#888',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#00ffe0',
                color: '#0a0e27',
                border: 'none',
                borderRadius: 4,
                cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                fontFamily: 'inherit',
                opacity: isValid && !submitting ? 1 : 0.6,
              }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
