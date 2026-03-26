'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type SignalForEdit = {
  id: string;
  text: string;
  title?: string | null;
  content?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
};

type EditSignalModalProps = {
  isOpen: boolean;
  signal: SignalForEdit | null;
  onClose: () => void;
  onSuccess?: (updated: Partial<SignalForEdit>) => void;
};

export default function EditSignalModal({ isOpen, signal, onClose, onSuccess }: EditSignalModalProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && signal) {
      setText(signal.text);
      setTitle(signal.title ?? '');
      setContent(signal.content ?? '');
      setMediaUrl(signal.mediaUrl ?? '');
      setError(null);
      setSaved(false);
    }
  }, [isOpen, signal]);

  if (!isOpen || !signal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { text: text.trim() };
      if (title.trim()) body.title = title.trim();
      if (content.trim()) body.content = content.trim();
      if (mediaUrl.trim()) body.mediaUrl = mediaUrl.trim();

      const res = await fetch(`/api/signal/${signal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setSaved(true);
      onSuccess?.({ id: signal.id, text, title: title.trim() || null, content: content.trim() || null, mediaUrl: mediaUrl.trim() || null });
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 600);
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
          width: 'min(90vw, 480px)',
          backgroundColor: '#14192e',
          border: '1px solid #1a1f3a',
          borderRadius: 8,
          padding: '1.5rem',
          zIndex: 9999,
        }}
      >
        <h3 style={{ margin: '0 0 1rem', color: '#00ffe0', fontSize: '1.1rem' }}>Edit Signal</h3>
        {saved && (
          <div
            style={{
              backgroundColor: '#0a0e27',
              border: '1px solid rgba(0,255,224,0.25)',
              padding: '0.75rem',
              borderRadius: 4,
              marginBottom: '0.5rem',
              color: '#00ffe0',
              fontSize: '0.95em',
            }}
          >
            Saved successfully
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', color: '#888', fontSize: '0.85em', marginBottom: '0.25rem' }}>
              Text (required, 3–240 chars)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
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
          <div>
            <label style={{ display: 'block', color: '#888', fontSize: '0.85em', marginBottom: '0.25rem' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional"
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
          <div>
            <label style={{ display: 'block', color: '#888', fontSize: '0.85em', marginBottom: '0.25rem' }}>Content / Body</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Optional"
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
          <div>
            <label style={{ display: 'block', color: '#888', fontSize: '0.85em', marginBottom: '0.25rem' }}>Media URL</label>
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://..."
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
