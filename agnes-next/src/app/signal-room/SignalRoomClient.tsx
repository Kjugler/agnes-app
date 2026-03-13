'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReplyModal from './ReplyModal';
import SignalMedia from './SignalMedia';
import RibbonTicker from './RibbonTicker';

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const signalDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - signalDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return signalDate.toLocaleDateString();
}

function getDisplayName(signal: {
  isSystem: boolean;
  userEmail?: string | null;
  userFirstName?: string | null;
}): string {
  if (signal.isSystem) return 'System';
  if (signal.userFirstName) return signal.userFirstName;
  if (signal.userEmail) {
    const [username] = signal.userEmail.split('@');
    return username;
  }
  return 'Anonymous';
}

function getLabel(signal: { isSystem: boolean }): string {
  return signal.isSystem ? 'SYSTEM' : 'USER';
}

type ReplyData = {
  id: string;
  text: string;
  createdAt: Date | string;
  userEmail?: string | null;
  userFirstName?: string | null;
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  ARCHIVE: 'Archive',
  LOCATION: 'Locations',
  VISUAL: 'Visual',
  NARRATIVE: 'Narrative',
  PLAYER_QUESTION: 'Questions',
  PODCASTER_PROMPT: 'Podcaster Prompts',
  SPECULATIVE: 'Speculative',
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
  tags?: unknown;
  discussionEnabled?: boolean;
  isSystem: boolean;
  createdAt: Date | string;
  userEmail?: string | null;
  userFirstName?: string | null;
  replyCount: number;
  acknowledgeCount: number;
  acknowledged: boolean;
  replies: ReplyData[];
};

type SignalRoomClientProps = {
  signals: SignalData[];
};

type FilterType = 'all' | string;

export default function SignalRoomClient({ signals: initialSignals }: SignalRoomClientProps) {
  const router = useRouter();
  const [signals, setSignals] = useState(initialSignals);
  const [filter, setFilter] = useState<FilterType>('all');
  const [replyModalSignalId, setReplyModalSignalId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredSignals = filter === 'all'
    ? signals
    : signals.filter((s) => (s.type || 'NARRATIVE') === filter);
  const latestSignal = filteredSignals[0] ?? null;
  const feedSignals = filteredSignals.slice(1);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          const lastDisplayed = feedSignals[feedSignals.length - 1] ?? latestSignal;
          const cursor = nextCursor ?? lastDisplayed?.id ?? signals[signals.length - 1]?.id;
          setLoadingMore(true);
          const typeParam = filter !== 'all' ? `&type=${encodeURIComponent(filter)}` : '';
          fetch(`/api/signals?limit=20&cursor=${cursor || ''}${typeParam}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.ok && d.signals?.length) {
                const newIds = new Set(signals.map((s) => s.id));
                const toAdd = d.signals.filter((s: SignalData) => !newIds.has(s.id));
                setSignals((prev) => [...prev, ...toAdd]);
                setNextCursor(d.nextCursor);
                setHasMore(!!d.hasMore);
              } else {
                setHasMore(false);
              }
            })
            .catch(() => setHasMore(false))
            .finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: '200px', threshold: 0.1 }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, nextCursor, signals, filter, latestSignal, feedSignals]);
  
  // Dev-only: Approve all pending signals and reviews
  const handleApproveAll = async () => {
    if (process.env.NODE_ENV !== 'development') return;
    
    setApproving(true);
    try {
      const response = await fetch('/api/admin/moderation/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (response.ok && data.ok) {
        console.log('[SignalRoom] ✅ Approved all pending items:', data);
        alert(`Approved ${data.approved?.signals || 0} signals and ${data.approved?.reviews || 0} reviews`);
        // Refresh page to show newly approved signals
        router.refresh();
      } else {
        console.error('[SignalRoom] Failed to approve all:', data);
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[SignalRoom] Error approving all:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setApproving(false);
    }
  };

  const handleAcknowledge = async (signalId: string) => {
    const signal = signals.find((s) => s.id === signalId);
    if (!signal) return;

    // Optimistic update
    const wasAcknowledged = signal.acknowledged;
    const newAcknowledgeCount = wasAcknowledged
      ? signal.acknowledgeCount - 1
      : signal.acknowledgeCount + 1;

    setSignals(
      signals.map((s) =>
        s.id === signalId
          ? {
              ...s,
              acknowledged: !wasAcknowledged,
              acknowledgeCount: newAcknowledgeCount,
            }
          : s
      )
    );

    try {
      const response = await fetch('/api/signal/ack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signalId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to acknowledge');
      }

      // Reconcile with server response
      if (data.ok) {
        setSignals(
          signals.map((s) =>
            s.id === signalId
              ? {
                  ...s,
                  acknowledged: data.acknowledged,
                  acknowledgeCount: data.count,
                }
              : s
          )
        );
      }
    } catch (err) {
      // Revert on error
      setSignals(
        signals.map((s) =>
          s.id === signalId
            ? {
                ...s,
                acknowledged: wasAcknowledged,
                acknowledgeCount: signal.acknowledgeCount,
              }
            : s
        )
      );
      console.error('[acknowledge] Error', err);
    }
  };

  const toggleReplies = (signalId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(signalId)) {
        next.delete(signalId);
      } else {
        next.add(signalId);
      }
      return next;
    });
  };

  function renderSignalCard(signal: SignalData) {
    const displayName = getDisplayName(signal);
    const label = getLabel(signal);
    const relativeTime = formatRelativeTime(signal.createdAt);
    const isRepliesExpanded = expandedReplies.has(signal.id);
    const bodyText = signal.content || signal.text;
    const typeLabel = signal.type ? SIGNAL_TYPE_LABELS[signal.type] ?? signal.type : null;

    return (
      <div
        style={{
          backgroundColor: '#14192e',
          border: '1px solid #1a1f3a',
          borderRadius: '4px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ color: signal.isSystem ? '#00ffe0' : '#ffcc00', fontWeight: 'bold', fontSize: '0.9em' }}>
              {displayName}
            </span>
            <span style={{ color: '#888', fontSize: '0.8em', padding: '2px 6px', backgroundColor: '#0a0e27', borderRadius: '2px' }}>
              {label}
            </span>
            {typeLabel && (
              <span style={{ color: '#00ffe0', fontSize: '0.75em', padding: '2px 6px', backgroundColor: '#1a1f3a', borderRadius: '2px' }}>
                {typeLabel}
              </span>
            )}
          </div>
          <span style={{ color: '#888', fontSize: '0.85em' }}>{relativeTime}</span>
        </div>
        {signal.title && (
          <div style={{ color: '#fff', fontSize: '1em', fontWeight: 600 }}>{signal.title}</div>
        )}
        <div style={{ color: '#e0e0e0', fontSize: '0.95em', lineHeight: '1.5', marginTop: '0.25rem' }}>
          {bodyText}
        </div>
        <SignalMedia mediaType={signal.mediaType} mediaUrl={signal.mediaUrl} />
        {signal.locationTag && (
          <div style={{ color: '#888', fontSize: '0.85em' }}>📍 {signal.locationTag}</div>
        )}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1a1f3a' }}>
          <div
            onClick={() => handleAcknowledge(signal.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: signal.acknowledged ? '#00ffe0' : '#888',
              fontSize: '0.85em',
              cursor: 'pointer',
              textShadow: signal.acknowledged ? '0 0 4px #00ffe0' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            ✓ Upvote {signal.acknowledgeCount > 0 && `(${signal.acknowledgeCount})`}
          </div>
          {signal.discussionEnabled !== false && (
            <div
              onClick={() => setReplyModalSignalId(signal.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer' }}
            >
              ↻ Theory {signal.replyCount > 0 && `(${signal.replyCount})`}
            </div>
          )}
          <Link
            href={`/signal-room/${signal.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#00ffe0', fontSize: '0.85em', textDecoration: 'none', fontWeight: 600 }}
          >
            View Signal →
          </Link>
          <div
            onClick={() => {
              const url = typeof window !== 'undefined' ? `${window.location.origin}/signal-room/${signal.id}` : '';
              const text = signal.title || signal.content || signal.text;
              if (navigator.share) {
                navigator.share({ title: signal.title || 'Signal', text, url }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(url || text);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer' }}
            title="Share signal"
          >
            ↗ Share
          </div>
          {signal.replyCount > 0 && (
            <div
              onClick={() => toggleReplies(signal.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer', marginLeft: 'auto' }}
            >
              {isRepliesExpanded ? '▼' : '▶'} {signal.replyCount} {signal.replyCount === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>
        {isRepliesExpanded && signal.replies.length > 0 && (
          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1a1f3a', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {signal.replies.map((reply) => {
              const replyDisplayName = reply.userFirstName || (reply.userEmail ? reply.userEmail.split('@')[0] : 'Anonymous');
              return (
                <div key={reply.id} style={{ backgroundColor: '#0a0e27', padding: '0.75rem', borderRadius: '4px', border: '1px solid #1a1f3a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#ffcc00', fontSize: '0.85em', fontWeight: 'bold' }}>{replyDisplayName}</span>
                    <span style={{ color: '#666', fontSize: '0.75em' }}>{formatRelativeTime(reply.createdAt)}</span>
                  </div>
                  <div style={{ color: '#d0d0d0', fontSize: '0.9em', lineHeight: '1.4' }}>{reply.text}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Dev-only: Approve all pending button */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 20,
          zIndex: 1000,
        }}>
          <button
            onClick={handleApproveAll}
            disabled={approving}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              backgroundColor: '#9333ea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: approving ? 'not-allowed' : 'pointer',
              opacity: approving ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            {approving ? 'Approving...' : 'Approve All (dev)'}
          </button>
        </div>
      )}
      
      {/* Center column with Signal Cards */}
      <main
        style={{
          flex: 1,
          maxWidth: '800px',
          width: '100%',
          minWidth: 0,
          margin: '0 auto',
          padding: '2rem 1rem',
          paddingBottom: '4rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Filter tabs */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85em',
              backgroundColor: filter === 'all' ? '#00ffe0' : '#1a1f3a',
              color: filter === 'all' ? '#000' : '#e0e0e0',
              border: `1px solid ${filter === 'all' ? '#00ffe0' : '#2a3a4a'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: filter === 'all' ? 600 : 400,
            }}
          >
            All
          </button>
          {(['ARCHIVE', 'LOCATION', 'VISUAL', 'NARRATIVE', 'PLAYER_QUESTION', 'PODCASTER_PROMPT', 'SPECULATIVE'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85em',
                backgroundColor: filter === t ? '#00ffe0' : '#1a1f3a',
                color: filter === t ? '#000' : '#e0e0e0',
                border: `1px solid ${filter === t ? '#00ffe0' : '#2a3a4a'}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: filter === t ? 600 : 400,
              }}
            >
              {SIGNAL_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        {/* Latest Signal (hero) */}
        {latestSignal && (
          <div
            style={{
              backgroundColor: '#0d1220',
              border: '2px solid #00ffe0',
              borderRadius: 8,
              padding: '1.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <div style={{ color: '#00ffe0', fontSize: '0.8em', fontWeight: 600, marginBottom: '0.5rem' }}>
              LATEST SIGNAL
            </div>
            {renderSignalCard(latestSignal)}
          </div>
        )}

        {/* Signal Feed */}
        {feedSignals.length > 0 && (
          <div style={{ color: '#888', fontSize: '0.9em', marginBottom: '0.25rem' }}>
            Signal Feed
          </div>
        )}
        {feedSignals.map((signal) => (
          <div key={signal.id}>
            {renderSignalCard(signal)}
          </div>
        ))}
        <div ref={loadMoreRef} style={{ minHeight: 1, padding: '1rem', textAlign: 'center' }}>
          {loadingMore && <span style={{ color: '#888', fontSize: '0.9em' }}>Loading more…</span>}
        </div>

        {/* Bottom CTA: Back to Contest Hub */}
        <div
          style={{
            marginTop: '2rem',
            padding: '1.5rem',
            textAlign: 'center',
            borderTop: '1px solid #1a1f3a',
          }}
        >
          <Link
            href="/contest"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#00ffe0',
              color: '#0a0e27',
              fontWeight: 600,
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: '1rem',
            }}
          >
            Back to Contest Hub
          </Link>
        </div>
      </main>

      {/* Reply Modal */}
      {replyModalSignalId && (
        <ReplyModal
          isOpen={true}
          signalId={replyModalSignalId}
          onClose={() => {
            setReplyModalSignalId(null);
            router.refresh();
          }}
        />
      )}

      <RibbonTicker />

      {/* Animations */}
      <style jsx global>{`
        @keyframes ticker {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </>
  );
}

