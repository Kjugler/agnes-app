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

export function resolveReferralCodeFromBrowser(searchParams: URLSearchParams): string | undefined {
  // Live URL first — useSearchParams can lag behind window.location on first paint
  if (typeof window !== 'undefined') {
    const live = new URLSearchParams(window.location.search);
    const codeFromLive = live.get('code')?.trim();
    if (codeFromLive) return codeFromLive;
    const refFromLive = live.get('ref')?.trim();
    if (refFromLive) return refFromLive;
  }

  const codeFromQuery = searchParams.get('code')?.trim();
  if (codeFromQuery) return codeFromQuery;

  const refFromQuery = searchParams.get('ref')?.trim();
  if (refFromQuery) return refFromQuery;

  const apRef = readCookie('ap_ref');
  if (apRef) return apRef;

  const refCookie = readCookie('ref');
  if (refCookie) return refCookie;

  try {
    const fromStorage = window.localStorage.getItem('referral_code')?.trim();
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }

  return undefined;
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
