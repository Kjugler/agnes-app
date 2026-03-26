/**
 * Signal Room access control: mode-based gating with optional TTL for code grants.
 * When SIGNAL_ROOM_ACCESS_MODE=public, no gate. Otherwise checks code/eligibility.
 */

export type SignalRoomAccessMode = 'public' | 'code' | 'eligibility' | 'hybrid';

export function getSignalRoomAccessMode(): SignalRoomAccessMode {
  const mode = (process.env.SIGNAL_ROOM_ACCESS_MODE || 'public').toLowerCase();
  if (['public', 'code', 'eligibility', 'hybrid'].includes(mode)) {
    return mode as SignalRoomAccessMode;
  }
  return 'public';
}

export function getSignalRoomAccessCode(): string | null {
  return process.env.SIGNAL_ROOM_ACCESS_CODE?.trim() || null;
}

/** TTL in minutes for code grants. Omit = no expiry. */
export function getSignalRoomCodeTtlMinutes(): number | null {
  const val = process.env.SIGNAL_ROOM_CODE_TTL_MINUTES;
  if (!val) return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Comma-separated emails allowed when mode is eligibility or hybrid. No schema change. */
export function getSignalRoomAccessEmails(): Set<string> {
  const raw = process.env.SIGNAL_ROOM_ACCESS_EMAILS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Cookie name for code-based access grant */
export const SIGNAL_ROOM_ACCESS_COOKIE = 'signal_room_access';

/** Check if code grant cookie is still valid (respects TTL). */
export function isCodeGrantValid(grantedAtIso: string | undefined): boolean {
  if (!grantedAtIso) return false;
  const ttlMs = getSignalRoomCodeTtlMinutes();
  if (!ttlMs) return true; // No TTL = never expires
  const grantedAt = new Date(grantedAtIso).getTime();
  if (!Number.isFinite(grantedAt)) return false;
  const expiresAt = grantedAt + ttlMs * 60 * 1000;
  return Date.now() < expiresAt;
}

export type SignalRoomAccessInput = {
  /** Cookie value for signal_room_access (format: "1" or ISO timestamp when TTL) */
  accessCookieValue?: string | null;
  /** User email (normalized lowercase) for eligibility check */
  userEmail?: string | null;
};

/** Determine if user has access to Signal Room based on mode and inputs. */
export function hasSignalRoomAccess(input: SignalRoomAccessInput): boolean {
  const mode = getSignalRoomAccessMode();
  if (mode === 'public') return true;

  const allowlist = getSignalRoomAccessEmails();
  const hasEligibility = !!(
    input.userEmail &&
    allowlist.size > 0 &&
    allowlist.has(input.userEmail.toLowerCase())
  );

  if (mode === 'eligibility') return hasEligibility;

  // code or hybrid: check code grant
  const code = getSignalRoomAccessCode();
  if (!code) {
    // Misconfiguration: code/hybrid mode but no code set → fall back to eligibility only for hybrid
    if (mode === 'hybrid') return hasEligibility;
    return false;
  }

  const cookieVal = input.accessCookieValue;
  const hasValidCodeGrant =
    cookieVal &&
    (cookieVal === '1' || isCodeGrantValid(cookieVal));

  if (mode === 'code') return !!hasValidCodeGrant;
  if (mode === 'hybrid') return hasValidCodeGrant || hasEligibility;
  return false;
}
