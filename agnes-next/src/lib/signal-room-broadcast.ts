/**
 * Live Broadcast Mode for Signal Room (Quiet Reveal).
 * Env-based: ACTIVE_BROADCAST_SIGNAL_ID + ACTIVE_BROADCAST_ENDS_AT.
 * When both set and endsAt > now, broadcast mode is active.
 */

export type BroadcastConfig = {
  signalId: string;
  endsAt: Date;
};

export function getActiveBroadcastConfig(): BroadcastConfig | null {
  const signalId = process.env.ACTIVE_BROADCAST_SIGNAL_ID?.trim();
  const endsAtRaw = process.env.ACTIVE_BROADCAST_ENDS_AT?.trim();
  if (!signalId || !endsAtRaw) return null;

  const endsAt = new Date(endsAtRaw);
  if (!Number.isFinite(endsAt.getTime())) return null;
  if (endsAt.getTime() <= Date.now()) return null; // broadcast ended

  return { signalId, endsAt };
}
