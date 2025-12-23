'use client';

import { useEffect } from 'react';
import { bootstrapContestEmail } from '@/lib/identity';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CheckoutWiring() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    bootstrapContestEmail();
  }, []);

  useEffect(() => {
    // Page-agnostic: wire ANY element with [data-checkout] to route to catalog
    // (also supports your existing [data-checkout="contest"])
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-checkout], [data-checkout="contest"]'),
    );
    if (nodes.length === 0) return;

    const removers: Array<() => void> = [];

    nodes.forEach((el) => {
      const handler = (e: Event) => {
        e.preventDefault();

        // Preserve tracking params from current URL
        const params = new URLSearchParams();
        const keysToPreserve = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
        
        keysToPreserve.forEach(key => {
          const value = searchParams.get(key);
          if (value) {
            params.set(key, value);
          }
        });

        // Route to catalog with preserved params
        router.push(`/catalog${params.toString() ? `?${params.toString()}` : ''}`);
      };

      el.addEventListener('click', handler);
      removers.push(() => el.removeEventListener('click', handler));
    });

    return () => removers.forEach((fn) => fn());
  }, [router, searchParams]);

  return null; // invisible; zero DOM/animation impact
}
