import React from 'react';
import { prisma } from '@/lib/db';
import { SignalStatus } from '@prisma/client';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import SignalRoomClient from './SignalRoomClient';
import SignalRoomHeader from './SignalRoomHeader';

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

  const signals = await prisma.signal.findMany({
    where: {
      status: SignalStatus.APPROVED,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
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

  // Map Prisma results to simple array for client component
  const signalsData = signals.map((signal) => ({
    id: signal.id,
    text: signal.text,
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
      <SignalRoomClient signals={signalsData} />
    </div>
  );
}

