import { readContestEmail } from './identity';

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
  product?: 'paperback' | 'ebook' | 'audio_preorder';
  qty?: number;
  source?: string; // goes into Stripe metadata.source
  path?: string; // goes into track meta.path
  successPath?: string;
  cancelPath?: string;
  metadata?: Record<string, string>;
};

export async function startCheckout(opts: StartCheckoutOpts = {}) {
  const {
    product = 'paperback', // Default to paperback
    qty = 1,
    successPath = '/contest/thank-you',
    cancelPath = '/contest',
    source = 'contest',
    path = typeof window !== 'undefined' ? window.location.pathname : '/contest',
    metadata: providedMetadata = {},
  } = opts;

  // 1) fire tracking first (non-blocking — does not affect animations)
  trackCheckoutStarted(source, path);

  // Root Cause B Fix: Email is optional - checkout can proceed without contest auth
  const email = readContestEmail();
  if (!email) {
    console.log('[startCheckout] Proceeding without contest email - Stripe will collect email', {
      note: 'Checkout does not require contest auth (Root Cause B fix)',
    });
    // Continue to checkout - email is optional
  }

  // Root Cause A Fix: Capture referral code with correct precedence: query param > cookie > localStorage
  // Query param ref must always override cookie (prevents stale referral context)
  let referralCode: string | undefined;
  if (typeof window !== 'undefined') {
    // Priority 1: Query params (highest priority - always wins)
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromQuery = urlParams.get('code'); // from /refer?code=...
    const refFromQuery = urlParams.get('ref'); // from /contest?ref=... or /catalog?ref=...
    
    if (codeFromQuery && codeFromQuery.trim()) {
      referralCode = codeFromQuery.trim();
    } else if (refFromQuery && refFromQuery.trim()) {
      referralCode = refFromQuery.trim();
    } else {
      // Priority 2: Cookie (ap_ref or ref)
      try {
        const cookies = document.cookie.split(';');
        const apRefCookie = cookies.find(c => c.trim().startsWith('ap_ref='));
        const refCookie = cookies.find(c => c.trim().startsWith('ref='));
        const cookieValue = apRefCookie?.split('=')[1] || refCookie?.split('=')[1];
        if (cookieValue) {
          referralCode = decodeURIComponent(cookieValue.trim());
        }
      } catch {
        // Cookie parsing failed
      }
      
      // Priority 3: localStorage (lowest priority - only if no query/cookie)
      if (!referralCode) {
        try {
          referralCode = window.localStorage.getItem('referral_code') || undefined;
        } catch {
          // localStorage not available
        }
      }
    }
  }

  // 2) create Stripe session via Next.js API route (blocking)
  try {
    // Merge provided metadata with source and referral code
    const metadata: Record<string, string> = {
      ...providedMetadata,
      source,
    };
    
    // Extract tracking params from metadata if present
    const ref = providedMetadata.ref || providedMetadata.referralCode || referralCode;
    const src = providedMetadata.src;
    const v = providedMetadata.v;
    const origin = providedMetadata.origin;
    
    if (ref) {
      metadata.referralCode = ref;
      metadata.ref = ref;
    }
    if (src) metadata.src = src;
    if (v) metadata.v = v;
    if (origin) metadata.origin = origin;

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(email ? { 'X-User-Email': email } : {}), // Only include email header if available
      },
      body: JSON.stringify({
        product,
        qty,
        successPath,
        cancelPath,
        ref,
        src,
        v,
        origin,
        metadata,
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
        // If response isn't JSON, try to get text
        try {
          const errorText = await res.text();
          if (errorText) {
            errorMessage = errorText;
          }
        } catch {
          // Use default message
        }
      }

      console.error('[startCheckout] Failed to create checkout session', {
        status: res.status,
        statusText: res.statusText,
        error: errorMessage,
      });

      throw new Error(errorMessage);
    }

    const data = await res.json();
    if (!data?.url) {
      throw new Error(data?.error || 'Checkout session created but no URL returned');
    }

    // Redirect to Stripe Checkout at top-level (breaks out of iframe if needed)
    // Stripe Checkout requires top-level navigation and will not work in iframes
    const target = window.top ?? window;
    try {
      const isFramed = window.self !== window.top;
      if (isFramed) {
        console.log('[startCheckout] Detected iframe context - redirecting top-level window');
      }
      target.location.assign(data.url);
    } catch (e) {
      // Cross-origin iframe would throw - fallback to same window
      console.warn('[startCheckout] Could not access top-level window (cross-origin?), using same window:', e);
      window.location.assign(data.url);
    }
  } catch (err: any) {
    console.error('[startCheckout] Checkout error', err);
    
    // If it's already an Error with a message, use it; otherwise create a network error message
    if (err instanceof Error && err.message) {
      throw err;
    }
    
    throw new Error('Network error while starting checkout. Please try again.');
  }
}

