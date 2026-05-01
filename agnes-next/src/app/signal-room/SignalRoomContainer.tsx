'use client';

import React, { useState, useCallback } from 'react';
import SignalRoomHeader from './SignalRoomHeader';
import SignalRoomClient from './SignalRoomClient';

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
  replies: Array<{
    id: string;
    text: string;
    createdAt: Date | string;
    userEmail?: string | null;
    userFirstName?: string | null;
  }>;
};

type SignalRoomContainerProps = {
  signals: SignalData[];
  /** When set, feed failed to load — do not show an endless “initializing” state */
  loadError?: string | null;
};

export default function SignalRoomContainer({
  signals,
  loadError = null,
}: SignalRoomContainerProps) {
  const [feedRefreshTrigger, setFeedRefreshTrigger] = useState(0);
  const bumpFeedRefresh = useCallback(() => {
    setFeedRefreshTrigger((t) => t + 1);
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#0a0e27',
        color: '#e0e0e0',
        fontFamily: '"Courier New", monospace',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <SignalRoomHeader onReviewSubmitted={bumpFeedRefresh} onSignalSubmitted={bumpFeedRefresh} />
      {loadError ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: '28rem' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#fca5a5' }}>
              Signal Room feed unavailable
            </p>
            <p style={{ fontSize: '0.95rem', opacity: 0.85, lineHeight: 1.5 }}>{loadError}</p>
          </div>
        </div>
      ) : (
        <SignalRoomClient signals={signals} feedRefreshTrigger={feedRefreshTrigger} />
      )}
    </div>
  );
}
