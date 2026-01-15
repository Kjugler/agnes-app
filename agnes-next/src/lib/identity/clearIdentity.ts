/**
 * Clears all identity-related storage (localStorage and cookies)
 * Used when user arrives "fresh" from Agnes Protocol page
 * 
 * Preserves:
 * - entry_variant (AB split stickiness)
 * - Tracking params (code, ref, v, src, toEmail, utm_*)
 * - Referral codes
 */
export function clearIdentityStorage() {
  if (typeof window === 'undefined') return;

  // Identity localStorage keys to clear
  const identityKeys = [
    'contest_email',
    'contest_user_id',
    'contest_user_code',
    'associate',
    'associate_id',
    'associate_email',
    'user_email',
    // Also clear these related keys
    'ap_code',
    'discount_code',
    'ref', // Note: this is localStorage 'ref', not cookie 'ref'
    'mockEmail',
    'contest:has-points',
  ];

  // Clear localStorage
  for (const key of identityKeys) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('[clearIdentity] Failed to remove localStorage key:', key, err);
    }
  }

  // Clear identity-related cookies
  // Only clear cookies that store identity, not tracking/referral cookies
  const identityCookies = [
    'contest_email',
    'user_email',
    'associate_email',
    'mockEmail',
  ];

  for (const cookieName of identityCookies) {
    try {
      // Clear cookie by setting it to expire in the past
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
      // Also try with Secure flag for ngrok
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure`;
    } catch (err) {
      console.warn('[clearIdentity] Failed to clear cookie:', cookieName, err);
    }
  }

  console.log('[clearIdentity] Identity storage cleared (fresh start)');
}

