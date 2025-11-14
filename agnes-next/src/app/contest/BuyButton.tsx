'use client';

import { readContestEmail } from '@/lib/identity';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export default function BuyButton() {
  async function onClick() {
    try {
      if (!API_BASE) {
        throw new Error('Checkout unavailable: NEXT_PUBLIC_API_BASE is not configured.');
      }

      const email = readContestEmail();
      if (!email) {
        throw new Error('Please enter the contest first so we know who to credit.');
      }

      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || `HTTP ${res.status}`);

      // go to Stripe Checkout
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || 'Could not start checkout.');
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
