/**
 * Server-validated identity for Jody remember-place.
 * Never treat ap_funnel_uid / query / body.userId as authorization.
 */

export const READERS_AGREE_LEAD_UID_COOKIE = 'ap_ra_lead_uid';
export const CONTEST_USER_ID_COOKIE = 'contest_user_id';
export const JODY_IDENTITY_HEADER = 'x-jody-identity-user-id';

export function normalizeIdentityUserId(raw: unknown): string | null {
  const id = String(raw || '').trim().slice(0, 64);
  return id || null;
}

export function resolveJodyRememberUserId(input: {
  contestUserId?: string | null;
  readersAgreeLeadUserId?: string | null;
  /** Analytics only — must never authorize remember-place mutation. */
  funnelUserId?: string | null;
}): string | null {
  void input.funnelUserId;
  return (
    normalizeIdentityUserId(input.contestUserId) ||
    normalizeIdentityUserId(input.readersAgreeLeadUserId) ||
    null
  );
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
