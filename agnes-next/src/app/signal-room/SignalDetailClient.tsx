'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SignalRoomHeader from './SignalRoomHeader';
import SignalMedia from './SignalMedia';

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

const TYPE_LABELS: Record<string, string> = {
  ARCHIVE: 'Archive',
  LOCATION: 'Locations',
  VISUAL: 'Visual',
  NARRATIVE: 'Narrative',
  PLAYER_QUESTION: 'Questions',
  PODCASTER_PROMPT: 'Podcaster Prompts',
  SPECULATIVE: 'Speculative',
};

type CommentData = {
  id: string;
  commentText: string;
  upvotes: number;
  createdAt: Date | string;
  userEmail?: string | null;
  userFirstName?: string | null;
  hasUpvoted: boolean;
};

type SignalData = {
  id: string;
  text: string;
  title?: string | null;
  type?: string | null;
  content?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  locationTag?: string | null;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  tags?: unknown;
  discussionEnabled: boolean;
  isSystem: boolean;
  createdAt: Date | string;
  userEmail?: string | null;
  userFirstName?: string | null;
  replyCount: number;
  acknowledgeCount: number;
  commentCount: number;
  acknowledged: boolean;
  replies: Array<{ id: string; text: string; createdAt: Date | string; userEmail?: string | null; userFirstName?: string | null }>;
  comments: CommentData[];
};

export default function SignalDetailClient({ signal }: { signal: SignalData }) {
  const router = useRouter();
  const [theoryText, setTheoryText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayName = signal.isSystem ? 'System' : signal.userFirstName || (signal.userEmail ? signal.userEmail.split('@')[0] : 'Anonymous');
  const bodyText = signal.content || signal.text;
  const typeLabel = signal.type ? TYPE_LABELS[signal.type] ?? signal.type : null;

  const handlePostTheory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!theoryText.trim() || submitting || !signal.discussionEnabled) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/signal/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId: signal.id, commentText: theoryText.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTheoryText('');
        router.refresh();
      } else {
        alert(data.error || 'Failed to post theory');
      }
    } catch (err) {
      alert('Failed to post theory');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpvoteComment = async (commentId: string) => {
    try {
      const res = await fetch('/api/signal/comment-upvote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      if (res.ok) router.refresh();
    } catch {
      // ignore
    }
  };

  const handleShare = (platform: 'facebook' | 'x' | 'sms' | 'copy') => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/signal-room/${signal.id}` : '';
    const text = signal.title || bodyText;
    if (platform === 'copy') {
      navigator.clipboard?.writeText(url);
      return;
    }
    const encoded = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);
    if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encoded}`, '_blank');
    } else if (platform === 'x') {
      window.open(`https://x.com/intent/tweet?url=${encoded}&text=${encodedText}`, '_blank');
    } else if (platform === 'sms') {
      const body = `${text} ${url}`.trim();
      window.location.href = `sms:?body=${encodeURIComponent(body)}`;
    }
  };

  return (
    <>
      <SignalRoomHeader />
      <main
        style={{
          flex: 1,
          maxWidth: 800,
          width: '100%',
          margin: '0 auto',
          padding: '2rem 1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          <Link
            href="/signal-room"
            style={{ color: '#00ffe0', fontSize: '0.9em', textDecoration: 'none' }}
          >
            ← Back to Signal Feed
          </Link>
          <Link
            href="/contest"
            style={{ color: '#00ffe0', fontSize: '0.9em', textDecoration: 'none' }}
          >
            ← Back to Contest Hub
          </Link>
        </div>

        <article
          style={{
            backgroundColor: '#14192e',
            border: '1px solid #1a1f3a',
            borderRadius: 8,
            padding: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ color: '#888', fontSize: '0.85em' }}>{formatRelativeTime(signal.createdAt)}</span>
            {typeLabel && (
              <span style={{ color: '#00ffe0', fontSize: '0.8em', padding: '2px 8px', backgroundColor: '#1a1f3a', borderRadius: 4 }}>
                {typeLabel}
              </span>
            )}
          </div>
          {signal.title && (
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: '#fff' }}>{signal.title}</h1>
          )}
          <div style={{ color: '#e0e0e0', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1rem' }}>{bodyText}</div>
          <SignalMedia mediaType={signal.mediaType} mediaUrl={signal.mediaUrl} />
          {(signal.locationName || signal.locationTag) && (
            <div style={{ color: '#888', fontSize: '0.9em', marginTop: '0.75rem' }}>
              📍 {signal.locationName || signal.locationTag}
            </div>
          )}
          {signal.tags && Array.isArray(signal.tags) && signal.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {(signal.tags as string[]).map((tag) => (
                <span key={tag} style={{ color: '#00ffe0', fontSize: '0.8em', padding: '2px 6px', backgroundColor: '#1a1f3a', borderRadius: 4 }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #1a1f3a', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleShare('copy')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9em', backgroundColor: '#1a1f3a', border: '1px solid #2a3a4a', borderRadius: 4, color: '#e0e0e0', cursor: 'pointer' }}
            >
              Copy Link
            </button>
            <button
              type="button"
              onClick={() => handleShare('facebook')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9em', backgroundColor: '#1a1f3a', border: '1px solid #2a3a4a', borderRadius: 4, color: '#e0e0e0', cursor: 'pointer' }}
            >
              Facebook
            </button>
            <button
              type="button"
              onClick={() => handleShare('x')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9em', backgroundColor: '#1a1f3a', border: '1px solid #2a3a4a', borderRadius: 4, color: '#e0e0e0', cursor: 'pointer' }}
            >
              X
            </button>
            <button
              type="button"
              onClick={() => handleShare('sms')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9em', backgroundColor: '#1a1f3a', border: '1px solid #2a3a4a', borderRadius: 4, color: '#e0e0e0', cursor: 'pointer' }}
            >
              SMS
            </button>
          </div>
        </article>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: '#00ffe0' }}>Community Theories</h2>

          {signal.discussionEnabled && (
            <form onSubmit={handlePostTheory} style={{ marginBottom: '1.5rem' }}>
              <textarea
                value={theoryText}
                onChange={(e) => setTheoryText(e.target.value)}
                placeholder="Post your theory..."
                maxLength={500}
                disabled={submitting}
                style={{
                  width: '100%',
                  minHeight: 100,
                  padding: '0.75rem',
                  backgroundColor: '#0a0e27',
                  border: '1px solid #1a1f3a',
                  borderRadius: 8,
                  color: '#e0e0e0',
                  fontSize: '0.95em',
                  resize: 'vertical',
                  marginBottom: '0.5rem',
                }}
              />
              <button
                type="submit"
                disabled={!theoryText.trim() || submitting}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: theoryText.trim() && !submitting ? '#00ffe0' : '#1a1f3a',
                  color: theoryText.trim() && !submitting ? '#000' : '#666',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.95em',
                  fontWeight: 600,
                  cursor: theoryText.trim() && !submitting ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Posting...' : 'Post Theory'}
              </button>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {signal.comments.map((comment) => (
              <div
                key={comment.id}
                style={{
                  backgroundColor: '#0a0e27',
                  padding: '1rem',
                  borderRadius: 8,
                  border: '1px solid #1a1f3a',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#ffcc00', fontSize: '0.9em', fontWeight: 600 }}>
                    {comment.userFirstName || (comment.userEmail ? comment.userEmail.split('@')[0] : 'Anonymous')}
                  </span>
                  <span style={{ color: '#666', fontSize: '0.8em' }}>{formatRelativeTime(comment.createdAt)}</span>
                </div>
                <div style={{ color: '#e0e0e0', fontSize: '0.95em', lineHeight: 1.5, marginBottom: '0.5rem' }}>
                  {comment.commentText}
                </div>
                <button
                  type="button"
                  onClick={() => handleUpvoteComment(comment.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    color: comment.hasUpvoted ? '#00ffe0' : '#888',
                    fontSize: '0.85em',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  ▲ {comment.upvotes}
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
