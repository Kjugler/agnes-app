import { readContestEmail } from './identity';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

// Non-blocking tracker: prefer sendBeacon; fallback to keepalive fetch
function trackCheckoutStarted(source: string, path: string) {
  const payload = { type: 'CHECKOUT_STARTED', source, meta: { path } };

  try {
    const email = readContestEmail();
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(
        '/api/track',
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      );
    } else {
      // fire-and-forget; do NOT await
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (email) headers['X-User-Email'] = email;
      fetch('/api/track', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true, // survives navigation
      }).catch(() => {});
    }
  } catch {
    /* swallow */
  }
}

export type StartCheckoutOpts = {
  qty?: number;
  source?: string; // goes into Stripe metadata.source
  path?: string; // goes into track meta.path
  successPath?: string;
  cancelPath?: string;
};

export async function startCheckout(opts: StartCheckoutOpts = {}) {
  const {
    qty = 1,
    successPath = '/contest/thank-you',
    cancelPath = '/contest',
    source = 'contest',
    path = typeof window !== 'undefined' ? window.location.pathname : '/contest',
  } = opts;

  // 1) fire tracking first (non-blocking — does not affect animations)
  trackCheckoutStarted(source, path);

  if (!API_BASE) {
    throw new Error('Checkout unavailable: NEXT_PUBLIC_API_BASE is not configured.');
  }

  const email = readContestEmail();
  if (!email) {
    throw new Error('Please enter the contest first so we know who to credit.');
  }

  // 2) create Stripe session (blocking)
  const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Email': email,
    },
    body: JSON.stringify({
      qty,
      successPath,
      cancelPath,
      metadata: { source }, // your existing server shape
    }),
  });

  if (!res.ok) {
    let errorText = '';
    try {
      errorText = await res.text();
    } catch {
      // ignore parsing error
    }

    console.error('[startCheckout] Failed to create checkout session', {
      status: res.status,
      statusText: res.statusText,
      body: errorText,
    });

    // Try to parse as JSON for structured error
    let errorMessage = 'Unable to create checkout session.';
    try {
      const errorData = JSON.parse(errorText);
      if (errorData?.error && typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      }
    } catch {
      // Use default message if not JSON
    }

    throw new Error(errorMessage);
  }

  const data = await res.json().catch(() => ({} as any));
  if (!data?.url) {
    throw new Error(data?.error || 'Checkout session created but no URL returned');
  }
  window.location.href = data.url; // go to Stripe Checkout
}

