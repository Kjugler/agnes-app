import React from 'react';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import { hasSignalRoomAccess, getSignalRoomAccessMode, SIGNAL_ROOM_ACCESS_COOKIE } from '@/lib/signal-room-access';
import SignalRoomContainer from './SignalRoomContainer';
import SignalRoomHeader from './SignalRoomHeader';
import SignalRoomGateView from './SignalRoomGateView';
import { isDailyBulletinTags } from '@/lib/parseFeedTags';
import { shouldLogSignalRoomLoaderServer } from '@/lib/signalRoomLoaderLog';

/** Published feed must not depend on contest cookies — force dynamic, no static stale snapshot */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getDeepquillBase() {
  return process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';
}

/**
 * Canonical public signal list: **no** Cookie header — same ordering for every visitor.
 * DeepQuill /api/signals does not filter rows by user; identity only affects isAuthor (optional client refresh).
 */
async function fetchPublicSignalsFromDeepquill(): Promise<{
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
    approvedAt?: string | null;
    moderationStatus?: string | null;
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
    const res = await fetch(`${getDeepquillBase()}/api/signals?limit=50`, {
      cache: 'no-store',
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false };
    }
    if (process.env.SIGNAL_ROOM_FEED_AUDIT_LOG === "1" && Array.isArray(data?.signals)) {
      const rows = data.signals as { createdAt?: string; approvedAt?: string | null }[];
      const times = rows
        .map((s) => {
          const t = s.approvedAt || s.createdAt;
          return t ? new Date(t).getTime() : NaN;
        })
        .filter((n) => Number.isFinite(n));
      const newestMs = times.length ? Math.max(...times) : null;
      console.log("[SignalRoomFeedAudit]", {
        deepquillBase: getDeepquillBase(),
        rawCount: rows.length,
        newestVisibleIso: newestMs ? new Date(newestMs).toISOString() : null,
      });
    }
    return data;
  } catch (err) {
    console.error('[SignalRoom] Failed to fetch public signals from deepquill:', err);
    return { ok: false };
  }
}

export default async function SignalRoomPage() {
  const cookieStore = await cookies();
  const cookieEmail =
    cookieStore.get('contest_email')?.value ||
    cookieStore.get('mockEmail')?.value ||
    cookieStore.get('user_email')?.value ||
    cookieStore.get('associate_email')?.value ||
    null;
  const accessCookieValue = cookieStore.get(SIGNAL_ROOM_ACCESS_COOKIE)?.value ?? null;
  const userEmail = cookieEmail ? normalizeEmail(cookieEmail) : null;
  const hasContestCookie = !!cookieEmail?.trim();
  const hasFulfillmentCookie = !!cookieStore.get('fulfillment-token')?.value?.trim();

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

  const { ok, signals: rawSignals } = await fetchPublicSignalsFromDeepquill();
  const publicSignalRoom = getSignalRoomAccessMode() === 'public';
  const signalsData = ok && Array.isArray(rawSignals)
    ? (publicSignalRoom ? rawSignals.filter((s) => !isDailyBulletinTags(s.tags)) : rawSignals).map((s) => ({
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
        approvedAt: s.approvedAt ?? null,
        moderationStatus: s.moderationStatus ?? 'APPROVED',
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

  if (shouldLogSignalRoomLoaderServer()) {
    console.log('[SignalRoomLoader]', {
      route: '/signal-room',
      sourceUsed: ok ? 'public_current_anonymous' : 'none_failed',
      accessMode: mode,
      hasContestCookie,
      hasFulfillmentCookie,
      publicFeedCount: signalsData.length,
      personalizedFeedCount: '(client /signals/me)',
      note: 'SSR uses cookie-less DeepQuill /api/signals so feed matches visitors without contest identity',
    });
  }

  const loadError = ok
    ? null
    : 'Unable to load the Signal Room feed. Check that the API is available, then refresh.';

  return <SignalRoomContainer signals={signalsData} loadError={loadError} />;
}
