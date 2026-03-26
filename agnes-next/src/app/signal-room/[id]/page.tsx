import React from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import { hasSignalRoomAccess, getSignalRoomAccessMode, SIGNAL_ROOM_ACCESS_COOKIE } from '@/lib/signal-room-access';
import SignalDetailClient from '../SignalDetailClient';
import SignalRoomHeader from '../SignalRoomHeader';
import SignalRoomGateView from '../SignalRoomGateView';

async function fetchSignalFromDeepquill(id: string, cookieHeader: string) {
  const base = process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(`${base}/api/signal/${id}`, { cache: 'no-store', headers });
  const data = await res.json();
  return data;
}

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const cookieEmail =
    cookieStore.get('contest_email')?.value ||
    cookieStore.get('mockEmail')?.value ||
    cookieStore.get('user_email')?.value ||
    cookieStore.get('associate_email')?.value ||
    null;
  const accessCookieValue = cookieStore.get(SIGNAL_ROOM_ACCESS_COOKIE)?.value ?? null;
  const userEmail = cookieEmail ? normalizeEmail(cookieEmail) : null;

  const mode = getSignalRoomAccessMode();
  const gated = mode !== 'public';
  const canAccess = gated
    ? hasSignalRoomAccess({ accessCookieValue, userEmail })
    : true;

  if (gated && !canAccess) {
    const showCodeInput = mode === 'code' || mode === 'hybrid';
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
        <SignalRoomHeader gated />
        <SignalRoomGateView showCodeInput={showCodeInput} />
      </div>
    );
  }

  const data = await fetchSignalFromDeepquill(id, cookieHeader);
  if (!data?.ok || !data?.signal) notFound();

  const s = data.signal;
  const signalData = {
    id: s.id,
    text: s.text,
    title: s.title ?? null,
    type: s.type ?? null,
    content: s.content ?? null,
    mediaType: s.mediaType ?? null,
    mediaUrl: s.mediaUrl ?? null,
    locationTag: s.locationTag ?? null,
    locationName: s.locationName ?? null,
    locationLat: s.locationLat ?? null,
    locationLng: s.locationLng ?? null,
    tags: s.tags ?? null,
    discussionEnabled: s.discussionEnabled ?? true,
    isSystem: s.isSystem,
    createdAt: s.createdAt,
    userEmail: s.userEmail ?? null,
    userFirstName: s.userFirstName ?? null,
    isAuthor: s.isAuthor ?? false,
    replyCount: s.replyCount ?? 0,
    acknowledgeCount: s.acknowledgeCount ?? 0,
    commentCount: s.commentCount ?? 0,
    acknowledged: s.acknowledged ?? false,
    replies: (s.replies ?? []).map((r: { id: string; text: string; createdAt: unknown; userEmail?: string | null; userFirstName?: string | null }) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      userEmail: r.userEmail ?? null,
      userFirstName: r.userFirstName ?? null,
    })),
    comments: (s.comments ?? []).map((c: { id: string; commentText: string; upvotes: number; createdAt: unknown; userEmail?: string | null; userFirstName?: string | null; hasUpvoted?: boolean }) => ({
      id: c.id,
      commentText: c.commentText,
      upvotes: c.upvotes ?? 0,
      createdAt: c.createdAt,
      userEmail: c.userEmail ?? null,
      userFirstName: c.userFirstName ?? null,
      hasUpvoted: c.hasUpvoted ?? false,
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
