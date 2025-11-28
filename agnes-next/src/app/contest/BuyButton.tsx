'use client';

import { readContestEmail } from '@/lib/identity';

export default function BuyButton() {
  async function onClick() {
    try {
      const email = readContestEmail();
      if (!email) {
        throw new Error('Please enter the contest first so we know who to credit.');
      }

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': email,
        },
        body: JSON.stringify({
          qty: 1,
          metadata: { source: 'contest' },
        }),
      });

      if (!res.ok) {
        let errorMessage = `Checkout failed with status ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData?.error && typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
        } catch {
          // If response isn't JSON, use default message
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      if (!data?.url) {
        throw new Error(data?.error || 'Checkout session created but no URL returned');
      }

      // go to Stripe Checkout
      window.location.href = data.url;
    } catch (e: any) {
      console.error('[BuyButton] Checkout error', e);
      alert(e?.message || 'Network error while starting checkout. Please try again.');
    }
  }

  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded bg-green-500 text-black font-semibold"
    >
      Buy the Book — $26
    </button>
  );
}
