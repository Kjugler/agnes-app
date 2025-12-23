'use client';

import React, { useState } from 'react';
import SignalComposer from './SignalComposer';
import ReviewsPanel from './ReviewsPanel';

export default function SignalRoomHeader() {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isReviewsPanelOpen, setIsReviewsPanelOpen] = useState(false);

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
        {/* Top-left: Signal icon placeholder */}
        <div
          style={{
            fontSize: '24px',
            color: '#00ffe0',
            fontWeight: 'bold',
          }}
        >
          📡 Signal
        </div>

        {/* Top-right: + icon and matrix icon */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
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
            onClick={() => setIsReviewsPanelOpen(true)}
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
        </div>
      </header>

      <SignalComposer isOpen={isComposerOpen} onClose={() => setIsComposerOpen(false)} />
      <ReviewsPanel isOpen={isReviewsPanelOpen} onClose={() => setIsReviewsPanelOpen(false)} />
    </>
  );
}

