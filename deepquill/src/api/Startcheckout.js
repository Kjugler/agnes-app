// deepquill/src/api/startCheckout.js
export async function startCheckout(
    { qty = 1, successPath = '/checkout/success', cancelPath = '/checkout/cancel', metadata = {} } = {},
    { apiBase } = {}
  ) {
    const base = apiBase || 'http://localhost:5055'; // your running API
    const res = await fetch(`${base}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty, successPath, cancelPath, metadata }),
    });
  
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(`Checkout failed: ${msg}`);
    }
  
    // send the user to Stripe Checkout
    window.location.href = data.url;
  }
  