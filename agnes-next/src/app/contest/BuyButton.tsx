'use client';

import { startCheckout } from '@/lib/checkout';

export default function BuyButton() {
  async function onClick() {
    try {
      await startCheckout({
        source: 'contest',
        qty: 1,
        successPath: '/contest/thank-you',
        cancelPath: '/contest',
      });
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
