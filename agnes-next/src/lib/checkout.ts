import { getProduct, type ProductId } from './products';
import { PAPERBACK_SHIPPING_CENTS, trackTikTok } from './tiktokPixel';
import { trackMeta } from './metaPixel';
import { FUNNEL_EVENT_TYPES, trackFunnelEvent } from './funnelTracking';
import { resolveValidatedReferralFromBrowser } from './resolveCatalogReferral';

// Non-blocking tracker: prefer sendBeacon; fallback to keepalive fetch
function trackCheckoutStarted(source: string, path: string) {
  const payload = { type: 'CHECKOUT_STARTED', source, meta: { path } };

  trackFunnelEvent(FUNNEL_EVENT_TYPES.CHECKOUT_STARTED, { source, path }, { source });

  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(
        '/api/track',
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      );
    } else {
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
    successPath = '/checkout/success',
    cancelPath = '/catalog',
    source = 'catalog',
    path = typeof window !== 'undefined' ? window.location.pathname : '/catalog',
    metadata: providedMetadata = {},
  } = opts;

  // 1) fire tracking first (non-blocking — does not affect animations)
  trackCheckoutStarted(source, path);

  // Anonymous checkout: Stripe collects buyer email. Do not send contest cookies/localStorage identity.

  // Validate referral candidates in browser order; skip invalid `code` when `ref` is valid.
  let referralCode: string | undefined;
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const validated = await resolveValidatedReferralFromBrowser(urlParams);
    if (validated?.valid) {
      referralCode = validated.code;
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

    const productInfo = getProduct(product as ProductId);
    let checkoutValueCents = productInfo?.priceCents ?? 0;
    if (product === 'paperback') {
      checkoutValueCents += PAPERBACK_SHIPPING_CENTS;
    }

    trackTikTok('InitiateCheckout', {
      content_id: product,
      value: checkoutValueCents / 100,
      currency: 'USD',
    });

    trackMeta('InitiateCheckout', {
      content_ids: [product],
      value: checkoutValueCents / 100,
      currency: 'USD',
      num_items: qty,
    });

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

