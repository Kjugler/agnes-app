/** Resolve referral code for catalog display — same precedence as checkout.ts. */

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const cookies = document.cookie.split(';');
    const match = cookies.find((c) => c.trim().startsWith(`${name}=`));
    if (!match) return undefined;
    const value = match.split('=').slice(1).join('=');
    return decodeURIComponent(value.trim()) || undefined;
  } catch {
    return undefined;
  }
}

export function hasTextAFriendDiscountCookie(): boolean {
  return readCookie('textafriend_discount') === '15';
}

function addReferralCandidate(candidates: string[], seen: Set<string>, raw?: string | null) {
  const trimmed = raw?.trim();
  if (!trimmed) return;
  const key = trimmed.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(trimmed);
}

/** Ordered referral candidates — same sources as checkout, de-duplicated. */
export function collectReferralCandidatesFromBrowser(searchParams: URLSearchParams): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  if (typeof window !== 'undefined') {
    const live = new URLSearchParams(window.location.search);
    addReferralCandidate(candidates, seen, live.get('code'));
    addReferralCandidate(candidates, seen, live.get('ref'));
  }

  addReferralCandidate(candidates, seen, searchParams.get('code'));
  addReferralCandidate(candidates, seen, searchParams.get('ref'));
  addReferralCandidate(candidates, seen, readCookie('ap_ref'));
  addReferralCandidate(candidates, seen, readCookie('ref'));

  try {
    addReferralCandidate(candidates, seen, window.localStorage.getItem('referral_code'));
  } catch {
    /* ignore */
  }

  return candidates;
}

/** First matching candidate (legacy). Prefer {@link resolveValidatedReferralFromBrowser}. */
export function resolveReferralCodeFromBrowser(searchParams: URLSearchParams): string | undefined {
  return collectReferralCandidatesFromBrowser(searchParams)[0];
}

export type ReferralValidationResult = {
  valid: boolean;
  code: string;
  /** True when deepquill proxy is unreachable (e.g. local server stopped). */
  serviceUnavailable?: boolean;
};

export async function validateReferralCode(code: string): Promise<ReferralValidationResult> {
  const normalized = code.trim().toUpperCase();
  const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(normalized)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    if (process.env.NODE_ENV === 'development' && res.status === 503) {
      console.warn(
        '[catalog] Referral validation unavailable (503). Is deepquill running on port 5055? npm run start-server in deepquill/',
      );
    }
    return { valid: false, code: normalized, serviceUnavailable: res.status === 503 };
  }
  const data = (await res.json()) as { valid?: boolean; code?: string };
  return {
    valid: Boolean(data.valid),
    code: typeof data.code === 'string' ? data.code : normalized,
  };
}

/** Validate candidates in precedence order; skips invalid `code` when `ref` is valid. */
export async function resolveValidatedReferralFromBrowser(
  searchParams: URLSearchParams,
): Promise<ReferralValidationResult | null> {
  const candidates = collectReferralCandidatesFromBrowser(searchParams);
  for (const candidate of candidates) {
    const result = await validateReferralCode(candidate);
    if (result.valid) return result;
    if (result.serviceUnavailable) return result;
  }
  return null;
}
