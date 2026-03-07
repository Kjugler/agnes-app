// deepquill/src/api/startCheckout.js

/**
 * Redirect to a URL at the top level (breaks out of iframe if needed)
 * Stripe Checkout requires top-level navigation and will not work in iframes
 * @param {string} url - URL to redirect to
 */
function redirectTopLevel(url) {
  // Always redirect at top-level window context (breaks out of iframe)
  // Stripe Checkout will refuse to load if it detects it's in an iframe
  const target = window.top ?? window;
  
  try {
    const isFramed = window.self !== window.top;
    if (isFramed) {
      console.log('[startCheckout] Detected iframe context - redirecting top-level window');
    } else {
      console.log('[startCheckout] Redirecting to checkout URL (top-level)');
    }
    target.location.assign(url);
  } catch (e) {
    // Cross-origin iframe would throw - fallback to same window
    console.warn('[startCheckout] Could not access top-level window (cross-origin?), using same window:', e);
    window.location.assign(url);
  }
}

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
  
    // Send the user to Stripe Checkout at top level (breaks out of iframe)
    redirectTopLevel(data.url);
  }
  