/**
 * When staff are logged in via fulfillment (/admin/fulfillment/auth) but have no
 * contest/user identity cookie, DeepQuill cannot resolve a User for Signal uploads.
 * Optional SIGNAL_STAFF_USER_EMAIL must match a User row in DeepQuill (same DB).
 */
import type { NextRequest } from 'next/server';
import { normalizeEmail } from '@/lib/email';

const IDENTITY_COOKIE_KEYS = ['contest_email', 'mockEmail', 'user_email', 'associate_email'] as const;

export function getUserIdentityEmailFromCookies(req: NextRequest): string | null {
  for (const key of IDENTITY_COOKIE_KEYS) {
    const raw = req.cookies.get(key)?.value;
    if (!raw) continue;
    const n = normalizeEmail(raw);
    if (n) return n;
  }
  return null;
}

/** Headers to forward to DeepQuill so resolveUserByEmail can attach uploads/signals to staff user */
export function staffSignalActingHeaders(req: NextRequest): Record<string, string> {
  const staffEmailRaw = process.env.SIGNAL_STAFF_USER_EMAIL?.trim();
  if (!staffEmailRaw) return {};

  const fulfillmentToken = req.cookies.get('fulfillment-token')?.value?.trim();
  if (!fulfillmentToken) return {};

  if (getUserIdentityEmailFromCookies(req)) return {};

  const normalized = normalizeEmail(staffEmailRaw);
  if (!normalized) return {};

  return { 'x-user-email': normalized };
}
