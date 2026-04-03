'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import SignalComposer from './SignalComposer';
import ReviewComposer from './ReviewComposer';

type SignalRoomHeaderProps = {
  /** When true (gate view), hide composer and reviews - user has no access yet */
  gated?: boolean;
  /** Called after a review is submitted (for feed refresh) */
  onReviewSubmitted?: () => void;
  /** Called after a signal is created (held or approved) so “my submissions” can refresh */
  onSignalSubmitted?: () => void;
};

export default function SignalRoomHeader({
  gated = false,
  onReviewSubmitted,
  onSignalSubmitted,
}: SignalRoomHeaderProps) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isReviewComposerOpen, setIsReviewComposerOpen] = useState(false);

  return (
    <>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 2rem',
          borderBottom: '1px solid #1a1f3a',
        }}
      >
        {/* Top-left: Back link + Signal icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <Link
            href="/contest"
            style={{
              color: '#00ffe0',
              fontSize: '0.9em',
              textDecoration: 'none',
            }}
          >
            ← Back to Contest Hub
          </Link>
          <span
            style={{
              fontSize: '24px',
              color: '#00ffe0',
              fontWeight: 'bold',
            }}
          >
            📡 Signal
          </span>
        </div>

        {/* Top-right: admin, composer, reviews (hidden when gated) */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <Link
            href="/signal-room/admin"
            title="Admin: Manage Signals"
            style={{
              fontSize: '20px',
              color: '#00ffe0',
              textDecoration: 'none',
            }}
          >
            ⚙
          </Link>
          {!gated && (
            <>
              <div
                onClick={() => setIsComposerOpen(true)}
                title="Send a Signal"
                style={{
                  fontSize: '20px',
                  color: '#00ffe0',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                +
              </div>
              <div
                onClick={() => setIsReviewComposerOpen(true)}
                title="Write a Review"
                style={{
                  fontSize: '20px',
                  color: '#00ffe0',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                ⚡
              </div>
            </>
          )}
        </div>
      </header>

      <SignalComposer
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onSubmitted={onSignalSubmitted}
      />
      <ReviewComposer
        isOpen={isReviewComposerOpen}
        onClose={() => setIsReviewComposerOpen(false)}
        onSubmitted={() => {
          onReviewSubmitted?.();
          setIsReviewComposerOpen(false);
        }}
      />
    </>
  );
}

