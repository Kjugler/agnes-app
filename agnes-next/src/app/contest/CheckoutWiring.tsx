'use client';

import { useEffect, useRef } from 'react';
import { bootstrapContestEmail } from '@/lib/identity';
import { startCheckout } from '@/lib/checkout';

export default function CheckoutWiring() {
  // Prevent accidental double-clicks from spawning two sessions
  const busyRef = useRef(false);

  useEffect(() => {
    bootstrapContestEmail();
  }, []);

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
        const source =
          dataset.source ||
          el.getAttribute('data-checkout') || // e.g. "contest"
          'contest';
        const path =
          dataset.path ||
          (typeof window !== 'undefined' ? window.location.pathname : '/contest');

        startCheckout({ qty, source, path })
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
