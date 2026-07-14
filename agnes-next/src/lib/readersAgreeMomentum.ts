/** Session-scoped Readers Agree momentum after external review validation. */

const REVIEW_VALIDATED_KEY = 'rrf_review_validated';
const MOMENTUM_ACTIVE_KEY = 'rrf_momentum_active';

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function remove(key: string): void {
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function markReadersAgreeReviewOpened(): void {
  if (typeof window === 'undefined') return;
  remove(MOMENTUM_ACTIVE_KEY);
  write(REVIEW_VALIDATED_KEY, '1');
}

export function hasReadersAgreeReviewMomentum(): boolean {
  if (typeof window === 'undefined') return false;
  return read(REVIEW_VALIDATED_KEY) === '1';
}

export function clearOrphanReadersAgreeValidatedSignal(): void {
  if (typeof window === 'undefined') return;
  if (hasReadersAgreeReviewMomentum()) return;
  try {
    localStorage.removeItem(REVIEW_VALIDATED_KEY);
  } catch {
    // ignore
  }
}

/** Promote validated → active once; safe across React Strict Mode remounts. */
export function syncReadersAgreeMomentumState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (hasReadersAgreeReviewMomentum()) {
      remove(REVIEW_VALIDATED_KEY);
      sessionStorage.setItem(MOMENTUM_ACTIVE_KEY, '1');
    }
    return sessionStorage.getItem(MOMENTUM_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearReadersAgreeMomentum(): void {
  if (typeof window === 'undefined') return;
  remove(MOMENTUM_ACTIVE_KEY);
  remove(REVIEW_VALIDATED_KEY);
  try {
    sessionStorage.removeItem(MOMENTUM_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export const READERS_AGREE_MOMENTUM_STORAGE_KEYS = {
  validated: REVIEW_VALIDATED_KEY,
  active: MOMENTUM_ACTIVE_KEY,
} as const;

const POPUP_BLOCKED_KEY = 'rrf_retailer_popup_blocked';

export function markRetailerPopupBlocked(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(POPUP_BLOCKED_KEY, '1');
  } catch {
    // ignore
  }
}

export function isRetailerPopupBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(POPUP_BLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearRetailerPopupBlocked(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(POPUP_BLOCKED_KEY);
  } catch {
    // ignore
  }
}

export function isReadersAgreeContinuationActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MOMENTUM_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}
