/**
 * Deepquill-based identity resolution.
 * Resolves user identity by email via deepquill /api/associate/status.
 * No local canonical writes - deepquill is the source of truth.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export type ResolvedIdentity = {
  id: string;
  code: string | null;
};

/**
 * Resolve user identity by email via deepquill.
 * Returns { id, code } when user exists in deepquill, null otherwise.
 * Does NOT create users - identity must exist in deepquill.
 */
export async function resolveIdentityByEmail(email: string): Promise<ResolvedIdentity | null> {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const url = `${API_BASE_URL}/api/associate/status?email=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.id) return null;
    return {
      id: data.id,
      code: data.code ?? null,
    };
  } catch (err) {
    console.error('[deepquillIdentity] resolveIdentityByEmail failed', { email: trimmed, error: err });
    throw err;
  }
}
