/**
 * Shared checkout utility for starting Stripe checkout sessions
 */

export type CheckoutPayload = {
  code?: string;
  email?: string;
  source?: string;
  priceId?: string;
  qty?: number;
  successPath?: string;
  cancelPath?: string;
};

export async function startCheckout(payload: CheckoutPayload = {}) {
  const {
    code,
    email,
    source = 'unknown',
    priceId,
    qty = 1,
    successPath = '/contest/thank-you',
    cancelPath = '/contest',
  } = payload;

  // Get code from localStorage if not provided
  const discountCode =
    code ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('discount_code') || localStorage.getItem('ap_code') || ''
      : '');

  // Get email from localStorage if not provided
  const userEmail =
    email ||
    (typeof window !== 'undefined' ? localStorage.getItem('user_email') || '' : '');

  const res = await fetch('/api/checkout/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: discountCode,
      email: userEmail,
      source,
      priceId,
      qty,
      successPath,
      cancelPath,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.error || `Checkout init failed (HTTP ${res.status})`);
  }

  const { url } = await res.json();
  if (!url) {
    throw new Error('No checkout URL returned');
  }

  window.location.href = url;
}

