'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReplyModal from './ReplyModal';
import EditSignalModal from './EditSignalModal';
import EditReviewModal from './EditReviewModal';
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

function formatAbsoluteTimestamp(date: Date | string | null | undefined): string {
  if (date == null) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function shortSignalId(id: string): string {
  return id.length <= 10 ? id : `…${id.slice(-8)}`;
}

const HELD_REASON_COPY: Record<string, string> = {
  LINK: 'Link in text',
  PROFANITY: 'Language flagged',
  MEDIA_UPLOAD: 'Uploaded video (moderation queue)',
  HARASSMENT: 'Harassment',
  HATE: 'Hate content',
  CLAIM: 'Claim / promo',
  OTHER: 'Other',
};

function heldReasonLine(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return HELD_REASON_COPY[reason] ?? reason;
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

function getReviewDisplayName(review: { userFirstName?: string | null; userEmail?: string | null }): string {
  if (review.userFirstName) return review.userFirstName;
  if (review.userEmail) {
    const [username] = review.userEmail.split('@');
    return username || 'Anonymous';
  }
  return 'Anonymous';
}

function getItemTypeLabel(item: { type: string; data: unknown }): string {
  if (item.type === 'review') return 'REVIEW';

  // Narrow safely before reading optional fields.
  if (typeof item.data !== 'object' || item.data === null) return 'SIGNAL';

  const s = item.data as {
    isSystem?: unknown;
    mediaUrl?: unknown;
    mediaType?: unknown;
    tags?: unknown;
  };

  const fs = parseFeedTags(s.tags)?.feedStyle;
  if (fs === 'parchment_declaration') return 'OFFICIAL';
  if (fs === 'daily_bulletin') return 'BULLETIN';

  const isSystem = typeof s.isSystem === 'boolean' ? s.isSystem : false;
  if (isSystem) return 'SYSTEM';

  const mediaUrl = typeof s.mediaUrl === 'string' ? s.mediaUrl : null;
  const mediaType = typeof s.mediaType === 'string' ? s.mediaType : null;
  if (mediaUrl && (mediaType === 'video' || mediaType === 'image' || mediaType === 'document')) {
    return 'TRANSMISSION';
  }

  return 'SIGNAL';
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
  isAuthor?: boolean;
  replyCount: number;
  acknowledgeCount: number;
  acknowledged: boolean;
  replies: ReplyData[];
  /** Present on list + /signals/me */
  approvedAt?: Date | string | null;
  moderationStatus?: string | null;
  heldReason?: string | null;
  heldAt?: Date | string | null;
  rejectedAt?: Date | string | null;
};

type ReviewData = {
  id: string;
  rating: number;
  text: string;
  tags?: string[] | null;
  createdAt: Date | string;
  /** When the review became publicly visible (falls back to createdAt in UI). */
  approvedAt?: Date | string | null;
  userEmail?: string | null;
  userFirstName?: string | null;
  isAuthor?: boolean;
};

type FeedItem =
  | { type: 'signal'; createdAt: Date | string; id: string; data: SignalData }
  | { type: 'review'; createdAt: Date | string; id: string; data: ReviewData };

type SignalRoomClientProps = {
  signals: SignalData[];
  feedRefreshTrigger?: number;
};

function parseFeedTags(tags: unknown): { feedStyle?: string } | null {
  if (tags == null) return null;
  try {
    const t = typeof tags === 'string' ? JSON.parse(tags) : tags;
    if (t && typeof t === 'object' && 'feedStyle' in t) return t as { feedStyle?: string };
    return null;
  } catch {
    return null;
  }
}

function visibleAtMsSignal(s: SignalData): number {
  const d = s.approvedAt ?? s.createdAt;
  return new Date(d).getTime();
}

function visibleAtMsReview(r: ReviewData): number {
  const d = r.approvedAt ?? r.createdAt;
  return new Date(d).getTime();
}

export default function SignalRoomClient({
  signals: initialSignals,
  feedRefreshTrigger = 0,
}: SignalRoomClientProps) {
  const router = useRouter();
  const [signals, setSignals] = useState(initialSignals);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [replyModalSignalId, setReplyModalSignalId] = useState<string | null>(null);
  const [editSignal, setEditSignal] = useState<SignalData | null>(null);
  const [editReview, setEditReview] = useState<ReviewData | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch reviews and merge into unified feed
  useEffect(() => {
    fetch('/api/reviews/list?take=100')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.reviews?.length) {
          setReviews(d.reviews);
        }
      })
      .catch(() => {});
  }, [feedRefreshTrigger]);

  const [mySignals, setMySignals] = useState<SignalData[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/signals/me', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => {
        if (cancelled || !d.ok || !Array.isArray(d.signals)) return;
        const mapped: SignalData[] = (d.signals as Record<string, unknown>[]).map((s) => ({
          id: String(s.id),
          text: String(s.text ?? ''),
          title: (s.title as string) ?? null,
          type: (s.type as string) ?? null,
          content: (s.content as string) ?? null,
          mediaType: (s.mediaType as string) ?? null,
          mediaUrl: (s.mediaUrl as string) ?? null,
          locationTag: (s.locationTag as string) ?? null,
          tags: s.tags,
          discussionEnabled: s.discussionEnabled !== false,
          isSystem: !!(s.isSystem as boolean),
          createdAt: s.createdAt as string,
          userEmail: (s.userEmail as string) ?? null,
          userFirstName: (s.userFirstName as string) ?? null,
          isAuthor: true,
          replyCount: 0,
          acknowledgeCount: 0,
          acknowledged: false,
          replies: [],
          approvedAt: (s.approvedAt as string) ?? null,
          moderationStatus: (s.moderationStatus as string) ?? null,
          heldReason: (s.heldReason as string) ?? null,
          heldAt: (s.heldAt as string) ?? null,
          rejectedAt: (s.rejectedAt as string) ?? null,
        }));
        setMySignals(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feedRefreshTrigger]);

  const pendingMySignals = useMemo(
    () => mySignals.filter((s) => s.moderationStatus === 'HELD' || s.moderationStatus === 'REJECTED'),
    [mySignals]
  );

  /** Unified chronological feed: newest public-visible content first (approvedAt ?? createdAt). */
  const feedItems: FeedItem[] = useMemo(() => {
    const merged: FeedItem[] = [
      ...signals.map((s) => ({ type: 'signal' as const, createdAt: s.createdAt, id: `signal-${s.id}`, data: s })),
      ...reviews.map((r) => ({ type: 'review' as const, createdAt: r.createdAt, id: `review-${r.id}`, data: r })),
    ];
    const getV = (item: FeedItem) => {
      if (item.type === 'signal') return visibleAtMsSignal(item.data);
      return visibleAtMsReview(item.data);
    };
    return merged.sort((a, b) => {
      const vb = getV(b);
      const va = getV(a);
      if (vb !== va) return vb - va;
      return b.id.localeCompare(a.id);
    });
  }, [signals, reviews]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          setLoadingMore(true);
          fetch(`/api/signals?limit=20&offset=${signals.length}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.ok && d.signals?.length) {
                const newIds = new Set(signals.map((s) => s.id));
                const toAdd = d.signals
                  .filter((s: { id: string }) => !newIds.has(s.id))
                  .map((s: Record<string, unknown>) => ({
                    id: s.id,
                    text: s.text,
                    title: s.title ?? null,
                    type: s.type ?? null,
                    content: s.content ?? null,
                    mediaType: s.mediaType ?? null,
                    mediaUrl: s.mediaUrl ?? null,
                    locationTag: s.locationTag ?? null,
                    tags: s.tags ?? null,
                    discussionEnabled: s.discussionEnabled ?? true,
                    isSystem: s.isSystem ?? false,
                    createdAt: s.createdAt,
                    approvedAt: (s as { approvedAt?: string | null }).approvedAt ?? null,
                    moderationStatus: (s as { moderationStatus?: string }).moderationStatus ?? 'APPROVED',
                    userEmail: s.userEmail ?? null,
                    userFirstName: s.userFirstName ?? null,
                    isAuthor: s.isAuthor ?? false,
                    replyCount: s.replyCount ?? 0,
                    acknowledgeCount: s.acknowledgeCount ?? 0,
                    acknowledged: s.acknowledged ?? false,
                    replies: (s.replies as ReplyData[]) ?? [],
                  }));
                setSignals((prev) => [...prev, ...toAdd]);
                setNextCursor(d.nextCursor ?? null);
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
  }, [hasMore, loadingMore, nextCursor, signals]);
  
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

  const handleDeleteSignal = async (signalId: string) => {
    if (!confirm('Delete this signal? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/signal/${signalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setSignals((prev) => prev.filter((s) => s.id !== signalId));
        setMySignals((prev) => prev.filter((s) => s.id !== signalId));
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Delete your review? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/review/${reviewId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== reviewId));
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  function renderParchmentDeclarationCard(signal: SignalData) {
    const publishedAt = signal.approvedAt ?? signal.createdAt;
    const body = signal.content || signal.text;
    return (
      <div
        style={{
          background: 'linear-gradient(165deg, #f7efd8 0%, #ebe0c8 45%, #e2d4b8 100%)',
          border: '3px double #3d2f1f',
          borderRadius: 4,
          padding: '1.75rem 1.5rem 2rem',
          color: '#1c1917',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <div style={{ textAlign: 'right', marginBottom: '0.75rem', fontSize: '0.72rem', color: '#57534e' }}>
          {formatAbsoluteTimestamp(publishedAt)} · {getLabel(signal)}
        </div>
        {signal.title && (
          <h2
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              textAlign: 'center',
              fontSize: '1.15rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              margin: '0 0 1.25rem',
              lineHeight: 1.35,
              color: '#0c0a09',
            }}
          >
            {signal.title}
          </h2>
        )}
        <div
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '0.92rem',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            textAlign: 'justify',
            color: '#292524',
          }}
        >
          {body}
        </div>
        <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(61, 47, 31, 0.2)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem' }}>
            <Link
              href={`/signal-room/${signal.id}`}
              style={{ color: '#1c3d5e', fontWeight: 600, textDecoration: 'underline' }}
            >
              View Signal →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function renderDailyBulletinCard(signal: SignalData) {
    const publishedAt = signal.approvedAt ?? signal.createdAt;
    const body = signal.content || signal.text;
    return (
      <section
        style={{
          backgroundColor: '#1a1530',
          border: '1px solid #6d28d9',
          borderRadius: 8,
          padding: '1.25rem 1.5rem',
        }}
        aria-label="Daily contest bulletin"
      >
        <div style={{ color: '#c4b5fd', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          OFFICIAL BULLETIN · {formatAbsoluteTimestamp(publishedAt)}
        </div>
        {signal.title && (
          <div style={{ color: '#f5f3ff', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>{signal.title}</div>
        )}
        <div style={{ color: '#e7e5e4', fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{body}</div>
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
          <Link href={`/signal-room/${signal.id}`} style={{ color: '#c4b5fd', fontWeight: 600 }}>
            View Signal →
          </Link>
        </div>
      </section>
    );
  }

  function renderSignalCard(signal: SignalData, cardContext: 'feed' | 'pending' = 'feed') {
    if (cardContext === 'feed') {
      const fs = parseFeedTags(signal.tags)?.feedStyle;
      if (fs === 'parchment_declaration') {
        return renderParchmentDeclarationCard(signal);
      }
      if (fs === 'daily_bulletin') {
        return renderDailyBulletinCard(signal);
      }
    }
    const displayName = getDisplayName(signal);
    const label = getLabel(signal);
    const publishedAt = signal.approvedAt ?? signal.createdAt;
    const relativeTime = formatRelativeTime(publishedAt);
    const isRepliesExpanded = expandedReplies.has(signal.id);
    const bodyText = signal.content || signal.text;
    const typeLabel = signal.type ? SIGNAL_TYPE_LABELS[signal.type] ?? signal.type : null;
    const mod = signal.moderationStatus;
    const borderColor =
      cardContext === 'pending'
        ? mod === 'REJECTED'
          ? '1px solid #6b2a2a'
          : '1px solid #5c4a1a'
        : '1px solid #1a1f3a';

    return (
      <div
        style={{
          backgroundColor: '#14192e',
          border: borderColor,
          borderRadius: '4px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
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
            {cardContext === 'feed' && (
              <span
                style={{
                  color: '#5eead4',
                  fontSize: '0.68em',
                  fontWeight: 700,
                  padding: '2px 6px',
                  backgroundColor: '#0f2f2a',
                  borderRadius: '2px',
                }}
              >
                PUBLISHED
              </span>
            )}
            {cardContext === 'pending' && mod === 'HELD' && (
              <span
                style={{
                  color: '#fbbf24',
                  fontSize: '0.68em',
                  fontWeight: 700,
                  padding: '2px 6px',
                  backgroundColor: '#2a2210',
                  borderRadius: '2px',
                }}
              >
                PENDING REVIEW
              </span>
            )}
            {cardContext === 'pending' && mod === 'REJECTED' && (
              <span
                style={{
                  color: '#f87171',
                  fontSize: '0.68em',
                  fontWeight: 700,
                  padding: '2px 6px',
                  backgroundColor: '#2a1010',
                  borderRadius: '2px',
                }}
              >
                NOT PUBLISHED
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, lineHeight: 1.35 }}>
            <div style={{ color: '#d4d4d4', fontSize: '0.8em', fontWeight: 600 }}>
              {cardContext === 'feed' ? formatAbsoluteTimestamp(publishedAt) : formatAbsoluteTimestamp(signal.createdAt)}
            </div>
            <div style={{ color: '#888', fontSize: '0.72em', marginTop: 2 }}>
              {relativeTime} · id {shortSignalId(signal.id)}
            </div>
            {cardContext === 'feed' &&
              signal.approvedAt &&
              Math.abs(new Date(signal.approvedAt).getTime() - new Date(signal.createdAt).getTime()) > 3000 && (
                <div style={{ color: '#666', fontSize: '0.68em', marginTop: 2 }}>
                  Submitted {formatAbsoluteTimestamp(signal.createdAt)}
                </div>
              )}
          </div>
        </div>
        {signal.title && (
          <div style={{ color: '#fff', fontSize: '1em', fontWeight: 600 }}>{signal.title}</div>
        )}
        <div style={{ color: '#e0e0e0', fontSize: '0.95em', lineHeight: '1.5', marginTop: '0.25rem' }}>
          {bodyText}
        </div>
        {cardContext === 'pending' && heldReasonLine(signal.heldReason) && (
          <div style={{ color: '#a8a29e', fontSize: '0.8em', fontStyle: 'italic' }}>
            Queue: {heldReasonLine(signal.heldReason)}
          </div>
        )}
        <SignalMedia mediaType={signal.mediaType} mediaUrl={signal.mediaUrl} />
        {signal.locationTag && (
          <div style={{ color: '#888', fontSize: '0.85em' }}>📍 {signal.locationTag}</div>
        )}
        {cardContext === 'feed' && (
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
            {signal.isAuthor && (
              <>
                <div
                  onClick={() => setEditSignal(signal)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer' }}
                  title="Edit"
                >
                  ✎ Edit
                </div>
                <div
                  onClick={() => handleDeleteSignal(signal.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer' }}
                  title="Delete"
                >
                  🗑 Delete
                </div>
              </>
            )}
            {signal.replyCount > 0 && (
              <div
                onClick={() => toggleReplies(signal.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer', marginLeft: 'auto' }}
              >
                {isRepliesExpanded ? '▼' : '▶'} {signal.replyCount} {signal.replyCount === 1 ? 'reply' : 'replies'}
              </div>
            )}
          </div>
        )}
        {cardContext === 'pending' && (
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid #1a1f3a',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              onClick={() => handleDeleteSignal(signal.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#888', fontSize: '0.85em', cursor: 'pointer' }}
              title="Delete"
            >
              🗑 Delete
            </div>
            <span style={{ color: '#666', fontSize: '0.78em', marginLeft: 'auto' }}>Hidden from the public feed until published</span>
          </div>
        )}
        {cardContext === 'feed' && isRepliesExpanded && signal.replies.length > 0 && (
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

  function renderReviewCard(review: ReviewData) {
    const displayName = getReviewDisplayName(review);
    const visibleAt = review.approvedAt ?? review.createdAt;
    const card = (
      <div
        key={review.id}
        style={{
          backgroundColor: '#14192e',
          border: '1px solid #1a1f3a',
          borderRadius: 4,
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#888', fontSize: '0.7em', padding: '2px 6px', backgroundColor: '#0a0e27', borderRadius: '2px' }}>
              REVIEW
            </span>
            <span style={{ color: '#ffcc00', fontSize: '0.9em', fontWeight: 'bold' }}>{displayName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#ffcc00', fontSize: '0.95em' }}>{'★'.repeat(review.rating)}</span>
            <span style={{ color: '#888', fontSize: '0.85em' }}>{formatRelativeTime(visibleAt)}</span>
            {review.isAuthor && (
              <>
                <span
                  onClick={() => setEditReview(review)}
                  style={{ color: '#888', fontSize: '0.8em', cursor: 'pointer' }}
                  title="Edit"
                >
                  ✎ Edit
                </span>
                <span
                  onClick={() => handleDeleteReview(review.id)}
                  style={{ color: '#888', fontSize: '0.8em', cursor: 'pointer' }}
                  title="Delete"
                >
                  🗑 Delete
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ color: '#e0e0e0', fontSize: '0.95em', lineHeight: '1.5' }}>{review.text}</div>
      </div>
    );
    return card;
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
        {pendingMySignals.length > 0 && (
          <section
            style={{
              backgroundColor: '#121008',
              border: '1px solid #5c4a1a',
              borderRadius: 8,
              padding: '1rem 1.25rem',
            }}
            aria-label="Your submissions awaiting publication"
          >
            <div
              style={{
                color: '#fbbf24',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                marginBottom: '0.65rem',
              }}
            >
              YOUR SUBMISSIONS — NOT IN THE PUBLIC FEED YET
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pendingMySignals.map((s) => (
                <div key={s.id}>{renderSignalCard(s, 'pending')}</div>
              ))}
            </div>
          </section>
        )}

        {/* Unified feed — single chronological order (visible time: approvedAt ?? createdAt) */}
        {feedItems.map((item) => (
          <div key={item.id}>
            {item.type === 'signal' ? (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#888', fontSize: '0.7em', padding: '2px 6px', backgroundColor: '#0a0e27', borderRadius: '2px' }}>
                    {getItemTypeLabel(item)}
                  </span>
                </div>
                {renderSignalCard(item.data, 'feed')}
              </div>
            ) : (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#888', fontSize: '0.7em', padding: '2px 6px', backgroundColor: '#0a0e27', borderRadius: '2px' }}>
                    REVIEW
                  </span>
                </div>
                {renderReviewCard(item.data)}
              </div>
            )}
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

      {/* Edit Signal Modal */}
      <EditSignalModal
        isOpen={!!editSignal}
        signal={editSignal}
        onClose={() => setEditSignal(null)}
        onSuccess={(updated) => {
          if (updated?.id) {
            setSignals((prev) =>
              prev.map((s) =>
                s.id === updated.id
                  ? {
                      ...s,
                      text: updated.text ?? s.text,
                      title: updated.title ?? s.title,
                      content: updated.content ?? s.content,
                      mediaUrl: updated.mediaUrl ?? s.mediaUrl,
                    }
                  : s
              )
            );
          }
        }}
      />

      {/* Edit Review Modal */}
      <EditReviewModal
        isOpen={!!editReview}
        review={editReview}
        onClose={() => setEditReview(null)}
        onSuccess={(updated) => {
          if (updated?.id) {
            setReviews((prev) =>
              prev.map((r) =>
                r.id === updated.id
                  ? {
                      ...r,
                      rating: updated.rating ?? r.rating,
                      text: updated.text ?? r.text,
                    }
                  : r
              )
            );
          }
        }}
      />

      <RibbonTicker />

      {/* Animations */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </>
  );
}

