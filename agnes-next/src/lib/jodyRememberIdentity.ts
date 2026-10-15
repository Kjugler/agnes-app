/**
 * Server-validated identity for Jody remember-place.
 * Never treat ap_funnel_uid / query / body.userId as authorization.
 * ap_ra_lead_uid is a signed session token, not a user id. Verify it
 * server-side before using it. Do not pass the raw cookie through here.
 */

export const READERS_AGREE_LEAD_UID_COOKIE = 'ap_ra_lead_uid';
export const READERS_AGREE_SESSION_HEADER = 'x-readers-agree-session';
export const CONTEST_USER_ID_COOKIE = 'contest_user_id';
export const JODY_IDENTITY_HEADER = 'x-jody-identity-user-id';

export function normalizeIdentityUserId(raw: unknown): string | null {
  const id = String(raw || '').trim().slice(0, 64);
  return id || null;
}

export function resolveJodyRememberUserId(input: {
  contestUserId?: string | null;
  /** Ignored. A raw Readers Agree user id must not authorize. */
  readersAgreeLeadUserId?: string | null;
  /** Analytics only — must never authorize remember-place mutation. */
  funnelUserId?: string | null;
}): string | null {
  void input.funnelUserId;
  void input.readersAgreeLeadUserId;
  return normalizeIdentityUserId(input.contestUserId);
}

/** Shape check only. Signature verification happens in deepquill. */
export function looksLikeReadersAgreeSessionToken(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const token = raw.trim();
  if (!token || token.length > 2000) return false;
  const parts = token.split('.');
  return parts.length === 2 && parts[0].length >= 16 && parts[1].length >= 20;
}

export function readersAgreeLeadIdentityCookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
}
