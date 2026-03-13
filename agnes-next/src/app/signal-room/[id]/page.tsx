import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import SignalDetailClient from '../SignalDetailClient';

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    } catch {
      // ignore
    }
  }

  const signal = await prisma.signal.findFirst({
    where: {
      id,
      status: 'APPROVED',
      OR: [{ publishStatus: 'PUBLISHED' }, { publishStatus: null }],
    },
    include: {
      user: { select: { email: true, firstName: true } },
      replies: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, firstName: true } } },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true } },
          upvoteRecords: currentUserId ? { where: { userId: currentUserId }, select: { id: true } } : { select: { id: true }, take: 0 },
        },
      },
      acknowledges: currentUserId ? { where: { userId: currentUserId }, select: { id: true } } : { select: { id: true }, take: 0 },
      _count: { select: { replies: true, acknowledges: true, comments: true } },
    },
  });

  if (!signal) notFound();

  const signalData = {
    id: signal.id,
    text: signal.text,
    title: signal.title ?? null,
    type: signal.type ?? null,
    content: signal.content ?? null,
    mediaType: signal.mediaType ?? null,
    mediaUrl: signal.mediaUrl ?? null,
    locationTag: signal.locationTag ?? null,
    locationName: signal.locationName ?? null,
    locationLat: signal.locationLat ?? null,
    locationLng: signal.locationLng ?? null,
    tags: signal.tags ?? null,
    discussionEnabled: signal.discussionEnabled ?? true,
    isSystem: signal.isSystem,
    createdAt: signal.createdAt,
    userEmail: signal.user?.email ?? null,
    userFirstName: signal.user?.firstName ?? null,
    replyCount: signal._count.replies,
    acknowledgeCount: signal._count.acknowledges,
    commentCount: signal._count.comments,
    acknowledged: signal.acknowledges.length > 0,
    replies: signal.replies.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      userEmail: r.user?.email ?? null,
      userFirstName: r.user?.firstName ?? null,
    })),
    comments: signal.comments
      .filter((c) => !c.isFlagged)
      .map((c) => ({
        id: c.id,
        commentText: c.commentText,
        upvotes: c.upvotes,
        createdAt: c.createdAt,
        userEmail: c.user?.email ?? null,
        userFirstName: c.user?.firstName ?? null,
        hasUpvoted: c.upvoteRecords.length > 0,
      })),
  };

  return (
    <div
      style={{
        backgroundColor: '#0a0e27',
        color: '#e0e0e0',
        fontFamily: '"Courier New", monospace',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SignalDetailClient signal={signalData} />
    </div>
  );
}
