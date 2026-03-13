import React from 'react';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import SignalRoomClient from './SignalRoomClient';
import SignalRoomHeader from './SignalRoomHeader';

type SignalRow = {
  id: string;
  createdAt: Date;
  text: string;
  title: string | null;
  type: string | null;
  content: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  locationTag: string | null;
  tags: unknown;
  discussionEnabled: boolean;
  status: 'APPROVED' | 'HELD' | 'REJECTED';
  isSystem: boolean;
  isAnonymous: boolean;
  user: { email: string | null; firstName: string | null } | null;
  replies: Array<{
    id: string;
    createdAt: Date;
    text: string;
    user: { email: string | null; firstName: string | null } | null;
  }>;
  acknowledges: Array<{ id: string }>;
  _count: {
    replies: number;
    acknowledges: number;
  };
};

export default async function SignalRoomPage() {
  // Get current user email for acknowledge status
  const cookieStore = await cookies();
  const cookieEmail =
    cookieStore.get('contest_email')?.value ||
    cookieStore.get('mockEmail')?.value ||
    cookieStore.get('user_email')?.value ||
    cookieStore.get('associate_email')?.value ||
    null;

  let currentUserId: string | null = null;
  if (cookieEmail) {
    try {
      const email = normalizeEmail(cookieEmail);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      currentUserId = user?.id || null;
    } catch (err) {
      // User not found or invalid email, continue without userId
    }
  }

  // Query signals with error handling for missing table
  let signals: SignalRow[] = [];
  try {
    signals = await prisma.signal.findMany({
      where: {
        AND: [
          { status: 'APPROVED' },
          { OR: [{ publishStatus: 'PUBLISHED' }, { publishStatus: null }] },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
        replies: {
          take: 3,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
              },
            },
          },
        },
        acknowledges: currentUserId
          ? {
              where: {
                userId: currentUserId,
              },
              select: {
                id: true,
              },
            }
          : {
              select: {
                id: true,
              },
              take: 0,
            },
        _count: {
          select: {
            replies: true,
            acknowledges: true,
          },
        },
      },
    });
  } catch (err: any) {
    // Handle missing table or other Prisma errors gracefully
    const errorMessage = err?.message || String(err);
    const errorCode = err?.code || '';
    
    // Check if it's a table missing error (only show "initializing" for this)
    const isTableMissing = 
      errorMessage.includes('no such table: Signal') ||
      errorMessage.includes('does not exist') && errorMessage.includes('Signal');
    
    if (isTableMissing) {
      console.error('[SignalRoom] Signal table does not exist:', errorMessage);
      console.error('[SignalRoom] Error code:', errorCode);
      console.error('[SignalRoom] DATABASE_URL:', process.env.DATABASE_URL);
      // Return empty array and render fallback UI
      signals = [];
    } else {
      // Other errors: log and show real error (not "initializing")
      console.error('[SignalRoom] Prisma error (not table missing):', {
        message: errorMessage,
        code: errorCode,
        stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
      });
      
      // Re-throw to show actual error (not "initializing" fallback)
      throw err;
    }
  }

  // Map Prisma results to simple array for client component
  // If signals is empty due to missing table, signalsData will be empty array
  const signalsData = signals.map((signal) => ({
    id: signal.id,
    text: signal.text,
    title: signal.title ?? null,
    type: signal.type ?? null,
    content: signal.content ?? null,
    mediaType: signal.mediaType ?? null,
    mediaUrl: signal.mediaUrl ?? null,
    locationTag: signal.locationTag ?? null,
    tags: signal.tags ?? null,
    discussionEnabled: signal.discussionEnabled ?? true,
    isSystem: signal.isSystem,
    createdAt: signal.createdAt,
    userEmail: signal.user?.email || null,
    userFirstName: signal.user?.firstName || null,
    replyCount: signal._count.replies,
    acknowledgeCount: signal._count.acknowledges,
    acknowledged: signal.acknowledges.length > 0,
    replies: signal.replies.map((reply) => ({
      id: reply.id,
      text: reply.text,
      createdAt: reply.createdAt,
      userEmail: reply.user?.email || null,
      userFirstName: reply.user?.firstName || null,
    })),
  }));

  // Render fallback UI if table is missing (signalsData will be empty)
  const isInitializing = signalsData.length === 0 && signals.length === 0;

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
      <SignalRoomHeader />
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
        <SignalRoomClient signals={signalsData} />
      )}
    </div>
  );
}

