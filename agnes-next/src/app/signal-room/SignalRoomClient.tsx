'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReplyModal from './ReplyModal';

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

type SignalData = {
  id: string;
  text: string;
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

export default function SignalRoomClient({ signals: initialSignals }: SignalRoomClientProps) {
  const router = useRouter();
  const [signals, setSignals] = useState(initialSignals);
  const [replyModalSignalId, setReplyModalSignalId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

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

  return (
    <>
      {/* Center column with Signal Cards */}
      <main
        style={{
          flex: 1,
          maxWidth: '800px',
          width: '100%',
          margin: '0 auto',
          padding: '2rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {signals.map((signal) => {
          const displayName = getDisplayName(signal);
          const label = getLabel(signal);
          const relativeTime = formatRelativeTime(signal.createdAt);
          const isRepliesExpanded = expandedReplies.has(signal.id);

          return (
            <div
              key={signal.id}
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
              {/* Name/System label and time row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      color: signal.isSystem ? '#00ffe0' : '#ffcc00',
                      fontWeight: 'bold',
                      fontSize: '0.9em',
                    }}
                  >
                    {displayName}
                  </span>
                  <span
                    style={{
                      color: '#888',
                      fontSize: '0.8em',
                      padding: '2px 6px',
                      backgroundColor: '#0a0e27',
                      borderRadius: '2px',
                    }}
                  >
                    {label}
                  </span>
                </div>
                <span
                  style={{
                    color: '#888',
                    fontSize: '0.85em',
                  }}
                >
                  {relativeTime}
                </span>
              </div>

              {/* Signal text */}
              <div
                style={{
                  color: '#e0e0e0',
                  fontSize: '0.95em',
                  lineHeight: '1.5',
                  marginTop: '0.25rem',
                }}
              >
                {signal.text}
              </div>

              {/* Action icons row */}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  marginTop: '0.5rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid #1a1f3a',
                }}
              >
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
                  ✓ Acknowledge {signal.acknowledgeCount > 0 && `(${signal.acknowledgeCount})`}
                </div>
                <div
                  onClick={() => setReplyModalSignalId(signal.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    color: '#888',
                    fontSize: '0.85em',
                    cursor: 'pointer',
                  }}
                >
                  ↻ Respond {signal.replyCount > 0 && `(${signal.replyCount})`}
                </div>
                {signal.replyCount > 0 && (
                  <div
                    onClick={() => toggleReplies(signal.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      color: '#888',
                      fontSize: '0.85em',
                      cursor: 'pointer',
                      marginLeft: 'auto',
                    }}
                  >
                    {isRepliesExpanded ? '▼' : '▶'} {signal.replyCount} {signal.replyCount === 1 ? 'reply' : 'replies'}
                  </div>
                )}
              </div>

              {/* Replies section */}
              {isRepliesExpanded && signal.replies.length > 0 && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #1a1f3a',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {signal.replies.map((reply) => {
                    const replyDisplayName = reply.userFirstName || (reply.userEmail ? reply.userEmail.split('@')[0] : 'Anonymous');
                    return (
                      <div
                        key={reply.id}
                        style={{
                          backgroundColor: '#0a0e27',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          border: '1px solid #1a1f3a',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <span
                            style={{
                              color: '#ffcc00',
                              fontSize: '0.85em',
                              fontWeight: 'bold',
                            }}
                          >
                            {replyDisplayName}
                          </span>
                          <span
                            style={{
                              color: '#666',
                              fontSize: '0.75em',
                            }}
                          >
                            {formatRelativeTime(reply.createdAt)}
                          </span>
                        </div>
                        <div
                          style={{
                            color: '#d0d0d0',
                            fontSize: '0.9em',
                            lineHeight: '1.4',
                          }}
                        >
                          {reply.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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

      {/* Bottom red banner with subtle motion */}
      <div
        style={{
          backgroundColor: 'red',
          color: 'white',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          position: 'fixed',
          bottom: 0,
          width: '100%',
          padding: '0.5rem',
          fontWeight: 'bold',
          fontSize: '14px',
          zIndex: 1000,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            paddingLeft: '100%',
            animation: 'ticker 25s linear infinite',
          }}
        >
          Signal Room Active • Monitoring all channels • Stay alert • Signal Room Active • Monitoring all channels • Stay alert
        </span>
      </div>

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

