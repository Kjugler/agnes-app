'use client';

import { useEffect, useRef } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

// Non-blocking tracker: prefer sendBeacon; fallback to keepalive fetch
function trackCheckoutStarted(source: string, path: string) {
  const payload = { type: 'CHECKOUT_STARTED', source, meta: { path } };

  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(
        '/api/track',
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      );
    } else {
      // fire-and-forget; do NOT await
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true, // survives navigation
      }).catch(() => {});
    }
  } catch {
    /* swallow */
  }
}

type StartOpts = {
  qty?: number;
  successPath?: string;
  cancelPath?: string;
  source?: string; // goes into Stripe metadata.source
  path?: string;   // goes into track meta.path
};

async function startCheckout(opts: StartOpts = {}) {
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

  // 2) create Stripe session (blocking)
  const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qty,
      successPath,
      cancelPath,
      metadata: { source }, // your existing server shape
    }),
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Checkout failed (HTTP ${res.status})`);
  }
  window.location.href = data.url; // go to Stripe Checkout
}

export default function CheckoutWiring() {
  // Prevent accidental double-clicks from spawning two sessions
  const busyRef = useRef(false);

  useEffect(() => {
    // Page-agnostic: wire ANY element with [data-checkout]
    // (also supports your existing [data-checkout="contest"])
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-checkout], [data-checkout="contest"]'),
    );
    if (nodes.length === 0) return;

    const removers: Array<() => void> = [];

    nodes.forEach((el) => {
      const handler = (e: Event) => {
        e.preventDefault();

        if (busyRef.current) return;
        busyRef.current = true;

        // Per-button overrides via data-*
        const dataset = el.dataset || {};
        const qty = Number(dataset.qty || '1');
        const successPath = dataset.success || '/contest/thank-you';
        const cancelPath = dataset.cancel || '/contest';
        const source =
          dataset.source ||
          el.getAttribute('data-checkout') || // e.g. "contest"
          'contest';
        const path =
          dataset.path ||
          (typeof window !== 'undefined' ? window.location.pathname : '/contest');

        startCheckout({ qty, successPath, cancelPath, source, path })
          .catch((err) => alert(err?.message || 'Could not start checkout.'))
          .finally(() => {
            // if we didn’t navigate (error), allow a retry
            busyRef.current = false;
          });
      };

      el.addEventListener('click', handler);
      removers.push(() => el.removeEventListener('click', handler));
    });

    return () => removers.forEach((fn) => fn());
  }, []);

  return null; // invisible; zero DOM/animation impact
}
