'use client';

/**
 * Proves which Next.js bundle is live. Enable with NEXT_PUBLIC_SIGNAL_ROOM_BUILD_MARKER=1 on Vercel.
 * NEXT_PUBLIC_BUILD_STAMP / NEXT_PUBLIC_GIT_SHA come from next.config.ts at build time.
 */
export default function SignalRoomBuildMarker() {
  if (process.env.NEXT_PUBLIC_SIGNAL_ROOM_BUILD_MARKER !== '1') {
    return null;
  }
  const stamp = process.env.NEXT_PUBLIC_BUILD_STAMP ?? '?';
  const sha = process.env.NEXT_PUBLIC_GIT_SHA ?? '?';
  const shortSha = sha.length > 7 ? sha.slice(0, 7) : sha;
  return (
    <div
      role="status"
      style={{
        padding: '8px 12px',
        margin: '12px',
        fontSize: '11px',
        color: 'rgba(224, 224, 224, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 6,
        fontFamily: 'ui-monospace, monospace',
        alignSelf: 'flex-start',
      }}
    >
      Signal Room build: {stamp} · {shortSha}
    </div>
  );
}
