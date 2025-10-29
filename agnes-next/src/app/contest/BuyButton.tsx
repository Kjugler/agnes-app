'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5055';

export default function BuyButton() {
  async function onClick() {
    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qty: 1,
          successPath: '/contest/thank-you', // adjust if you prefer another return page
          cancelPath: '/contest',
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
