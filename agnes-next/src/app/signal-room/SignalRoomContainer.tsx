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
  isInitializing: boolean;
};

export default function SignalRoomContainer({
  signals,
  isInitializing,
}: SignalRoomContainerProps) {
  // Do not key SignalRoomClient by signals[0] — remounting would reset client feed state.
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
      {isInitializing ? (
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
          <div>
            <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
              Signal Room is initializing.
            </p>
            <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
              Please refresh in a moment.
            </p>
          </div>
        </div>
      ) : (
        <SignalRoomClient signals={signals} feedRefreshTrigger={feedRefreshTrigger} />
      )}
    </div>
  );
}
