/** Session-scoped Readers Agree momentum after external review validation. */

const REVIEW_VALIDATED_KEY = 'rrf_review_validated';
const MOMENTUM_ACTIVE_KEY = 'rrf_momentum_active';
const BRIDGE_DEPARTED_KEY = 'rrf_bridge_went_hidden';

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

export function markBridgeTabDeparted(): void {
  if (typeof window === 'undefined') return;
  write(BRIDGE_DEPARTED_KEY, '1');
}

export function hasBridgeTabDeparted(): boolean {
  if (typeof window === 'undefined') return false;
  return read(BRIDGE_DEPARTED_KEY) === '1';
}

export function clearBridgeTabDeparted(): void {
  if (typeof window === 'undefined') return;
  remove(BRIDGE_DEPARTED_KEY);
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
      write(MOMENTUM_ACTIVE_KEY, '1');
    }
    return isReadersAgreeContinuationActive();
  } catch {
    return false;
  }
}

/** Promote to continuation only after the visitor left the bridge and returned. */
export function tryPromoteReadersAgreeContinuation(): boolean {
  if (typeof window === 'undefined') return false;
  if (isReadersAgreeContinuationActive()) return true;
  if (!hasReadersAgreeReviewMomentum()) return false;
  if (!hasBridgeTabDeparted()) return false;
  return syncReadersAgreeMomentumState();
}

export function clearReadersAgreeMomentum(): void {
  if (typeof window === 'undefined') return;
  remove(MOMENTUM_ACTIVE_KEY);
  remove(REVIEW_VALIDATED_KEY);
}

export const READERS_AGREE_MOMENTUM_STORAGE_KEYS = {
  validated: REVIEW_VALIDATED_KEY,
  active: MOMENTUM_ACTIVE_KEY,
  departed: BRIDGE_DEPARTED_KEY,
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

export function resetBridgeSessionState(): void {
  if (typeof window === 'undefined') return;
  clearBridgeTabDeparted();
  clearReadersAgreeMomentum();
  clearRetailerPopupBlocked();
}

export function isReadersAgreeContinuationActive(): boolean {
  if (typeof window === 'undefined') return false;
  return read(MOMENTUM_ACTIVE_KEY) === '1';
}

/** Read current momentum flags from storage (session first, then local mirror). */
export function getReadersAgreeMomentumSnapshot(): {
  validated: boolean;
  departed: boolean;
  active: boolean;
} {
  return {
    validated: hasReadersAgreeReviewMomentum(),
    departed: hasBridgeTabDeparted(),
    active: isReadersAgreeContinuationActive(),
  };
}

/** If the visitor already left for reviews, record departure when the bridge loads hidden. */
export function markBridgeDepartedIfCurrentlyHidden(): void {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden' || !document.hasFocus()) {
    markBridgeTabDeparted();
  }
}
