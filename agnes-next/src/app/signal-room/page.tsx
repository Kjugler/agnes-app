import React from 'react';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import { hasSignalRoomAccess, getSignalRoomAccessMode, SIGNAL_ROOM_ACCESS_COOKIE } from '@/lib/signal-room-access';
import { getActiveBroadcastConfig } from '@/lib/signal-room-broadcast';
import SignalRoomContainer from './SignalRoomContainer';
import SignalRoomHeader from './SignalRoomHeader';
import SignalRoomGateView from './SignalRoomGateView';

function getDeepquillBase() {
  return process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';
}

/** Fetches a single signal from deepquill */
async function fetchSignalFromDeepquill(
  id: string,
  cookieHeader: string
): Promise<{ ok: boolean; signal?: Record<string, unknown> }> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const res = await fetch(`${getDeepquillBase()}/api/signal/${id}`, { cache: 'no-store', headers });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[SignalRoom] Failed to fetch signal from deepquill:', err);
    return { ok: false };
  }
}

/** Fetches initial signals from deepquill (same source as creates and load-more) */
async function fetchInitialSignalsFromDeepquill(cookieHeader: string): Promise<{
  ok: boolean;
  signals?: Array<{
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
    isSystem?: boolean;
    createdAt: Date | string;
    userEmail?: string | null;
    userFirstName?: string | null;
    isAuthor?: boolean;
    replyCount?: number;
    acknowledgeCount?: number;
    acknowledged?: boolean;
    replies?: Array<{
      id: string;
      text: string;
      createdAt: Date | string;
      userEmail?: string | null;
      userFirstName?: string | null;
    }>;
  }>;
}> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const res = await fetch(`${getDeepquillBase()}/api/signals?limit=50`, {
      cache: 'no-store',
      headers,
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[SignalRoom] Failed to fetch initial signals from deepquill:', err);
    return { ok: false };
  }
}

export default async function SignalRoomPage() {
  // Get current user email for acknowledge status and access check
  const cookieStore = await cookies();
  const cookieEmail =
    cookieStore.get('contest_email')?.value ||
    cookieStore.get('mockEmail')?.value ||
    cookieStore.get('user_email')?.value ||
    cookieStore.get('associate_email')?.value ||
    null;
  const accessCookieValue = cookieStore.get(SIGNAL_ROOM_ACCESS_COOKIE)?.value ?? null;
  const userEmail = cookieEmail ? normalizeEmail(cookieEmail) : null;

  // Gating: when mode is code/eligibility/hybrid, check access
  const mode = getSignalRoomAccessMode();
  const gated = mode !== 'public';
  const canAccess = gated
    ? hasSignalRoomAccess({
        accessCookieValue,
        userEmail,
      })
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

  // Fetch initial signals from deepquill (same source as creates and load-more)
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const { ok, signals: rawSignals } = await fetchInitialSignalsFromDeepquill(cookieHeader);
  const signalsData = ok && Array.isArray(rawSignals)
    ? rawSignals.map((s) => ({
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
        userEmail: s.userEmail ?? null,
        userFirstName: s.userFirstName ?? null,
        isAuthor: s.isAuthor ?? false,
        replyCount: s.replyCount ?? 0,
        acknowledgeCount: s.acknowledgeCount ?? 0,
        acknowledged: s.acknowledged ?? false,
        replies: (s.replies ?? []).map((r) => ({
          id: r.id,
          text: r.text,
          createdAt: r.createdAt,
          userEmail: r.userEmail ?? null,
          userFirstName: r.userFirstName ?? null,
        })),
      }))
    : [];

  const isInitializing = !ok;

  return (
    <SignalRoomContainer signals={signalsData} isInitializing={isInitializing} />
  );
}

