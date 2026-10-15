/**
 * Same-tab marker after a Readers Agree submit.
 * Not authentication. Chapter access uses the signed HttpOnly session.
 */

const SESSION_KEY = 'ap_ra_v2_lead_active';

export function markReadersAgreeLeadSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isReadersAgreeLeadSessionActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearReadersAgreeLeadSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
