// deepquill/api/create-checkout-session.cjs
// Use centralized Stripe client and env config

// Part 1: Import envConfig FIRST and validate required vars
const envConfig = require('../src/config/env.cjs');

// Guard: Ensure required env vars exist
if (!envConfig?.SITE_URL) {
  throw new Error('[CHECKOUT] SITE_URL missing in deepquill env');
}
if (!envConfig?.STRIPE_SECRET_KEY) {
  throw new Error('[CHECKOUT] STRIPE_SECRET_KEY missing in deepquill env');
}

// Import Stripe client (uses envConfig.STRIPE_SECRET_KEY)
const { stripe } = require('../src/lib/stripe.cjs');

// Strict product-to-price mapping (no fallbacks)
const PRICE_BY_PRODUCT = {
  paperback: envConfig.STRIPE_PRICE_PAPERBACK,
  ebook: envConfig.STRIPE_PRICE_EBOOK,
  audio_preorder: envConfig.STRIPE_PRICE_AUDIO_PREORDER,
};

// Part 2: Do NOT use Prisma for ref validation - it's optional and non-blocking
// Ref validation is now allowlist-only (no DB dependency)

/**
 * Part 2: Validate associate publisher ref (non-blocking, allowlist-only)
 * Returns { valid: boolean, method: 'allowlist' | 'format' | null }
 * 
 * Key rules:
 * - Ref is optional (checkout proceeds even if missing/invalid)
 * - No Prisma dependency (deepquill doesn't have User table)
 * - Format validation: 4-12 alphanumeric characters
 * - Allowlist validation: if provided, check against allowlist
 */
function isValidAssociatePublisherRef(ref) {
  // A) Safe parsing: ref is optional
  if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
    return { valid: false, method: null };
  }

  // Sanitize: uppercase and trim
  const normalizedRef = ref.trim().toUpperCase();

  // Format validation: allow only [A-Z0-9]{4,12}
  const formatRegex = /^[A-Z0-9]{4,12}$/;
  if (!formatRegex.test(normalizedRef)) {
    console.log('[CHECKOUT_REF] Invalid format, rejecting:', normalizedRef);
    return { valid: false, method: null };
  }

  // B) Validation strategy: allowlist-only (no Prisma)
  const allowlistMode = envConfig.ASSOCIATE_REF_ALLOWLIST_MODE || 'allowlist';
  const allowlist = envConfig.ASSOCIATE_REF_ALLOWLIST || [];

  if (allowlistMode === 'any') {
    // In "any" mode, accept any ref that passes format validation
    return { valid: true, method: 'format' };
  } else {
    // Default: allowlist mode - check if ref is in allowlist
    const valid = allowlist.includes(normalizedRef);
    return { valid, method: valid ? 'allowlist' : null };
  }
}

/**
 * POST /api/create-checkout-session
 * body: { 
 *   product: 'paperback' | 'ebook' | 'audio_preorder',
 *   qty?: number, 
 *   ref?: string,
 *   successPath?: string, 
 *   cancelPath?: string, 
 *   metadata?: object 
 * }
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Validate product parameter (required)
    const product = req.body?.product;
    if (!product || !(product in PRICE_BY_PRODUCT)) {
      return res.status(400).json({ 
        error: `Invalid product: ${product}. Must be one of: paperback, ebook, audio_preorder` 
      });
    }

    // Resolve and validate priceId (no fallback to STRIPE_PRICE_ID)
    const priceId = PRICE_BY_PRODUCT[product];
    if (!priceId || !priceId.startsWith('price_')) {
      return res.status(500).json({ 
        error: `Missing Stripe price env for product=${product}. Check STRIPE_PRICE_${product.toUpperCase()}` 
      });
    }

    // Get referral code (optional, non-blocking)
    const refRaw = req.body?.ref || req.body?.referralCode || '';
    const ref = refRaw ? refRaw.trim() : '';
    
    // Validate ref if present (non-blocking - checkout proceeds even if invalid)
    let appliedDiscount = false;
    let refValidationResult = { valid: false, method: null };
    if (ref) {
      // Synchronous validation (no Prisma/async needed)
      refValidationResult = isValidAssociatePublisherRef(ref);
      appliedDiscount = refValidationResult.valid;
      
      console.log('[CHECKOUT_REF]', {
        ref: ref.toUpperCase(),
        valid: refValidationResult.valid,
        method: refValidationResult.method,
        allowlistHit: refValidationResult.method === 'allowlist',
        allowlistMode: envConfig.ASSOCIATE_REF_ALLOWLIST_MODE,
        allowlistCount: envConfig.ASSOCIATE_REF_ALLOWLIST.length,
      });
    }
    
    console.log('[CHECKOUT_START_SERVER]', { 
      product, 
      priceId, 
      ref: ref || 'none', 
      appliedDiscount,
      refValid: refValidationResult.valid,
      refMethod: refValidationResult.method,
    });

    const qty = Math.max(1, Number(req.body?.qty || 1));
    const successPath = req.body?.successPath || '/contest/thank-you';
    const cancelPath  = req.body?.cancelPath  || '/contest';
    const metadata    = (req.body && req.body.metadata) || {};

    // Add product, ref, and tracking params to metadata
    metadata.product = product;
    if (ref) {
      metadata.ref = ref.toUpperCase();
      metadata.ref_valid = appliedDiscount ? 'true' : 'false';
    }
    if (req.body?.src) metadata.src = req.body.src;
    if (req.body?.v) metadata.v = req.body.v;
    if (req.body?.origin) metadata.origin = req.body.origin;

    // GUARDRAIL: Use request origin, not env vars (prevents stale ngrok URLs)
    // Priority 1: Use origin from request body (passed from agnes-next)
    // Priority 2: Use x-forwarded-host headers (if proxied)
    // Priority 3: Fallback to env var (only if origin unavailable)
    let origin = req.body?.origin || null;
    
    if (!origin) {
      // Try x-forwarded-host headers (common with ngrok/proxies)
      const forwardedHost = req.headers['x-forwarded-host'];
      const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
      if (forwardedHost) {
        origin = `${forwardedProto}://${forwardedHost}`;
        console.log('[CHECKOUT] Using x-forwarded-host origin:', origin);
      }
    }
    
    if (!origin) {
      // Fallback to env var (warn - this can be stale)
      origin = envConfig.SITE_URL;
      if (origin) {
        console.warn('[CHECKOUT] Using env var origin (request origin unavailable):', origin);
      } else {
        throw new Error('SITE_URL or request origin must be configured for checkout redirects');
      }
    } else {
      console.log('[CHECKOUT] Using request origin:', origin);
    }

    const success_url = `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${origin}${cancelPath}`;

    // Use priceId directly (already validated)
    const line_items = [{ price: priceId, quantity: qty }];

    // Prepare discounts array for Stripe coupon (only if ref is valid)
    const discounts = [];
    if (appliedDiscount && envConfig.STRIPE_ASSOCIATE_15_COUPON_ID) {
      discounts.push({ coupon: envConfig.STRIPE_ASSOCIATE_15_COUPON_ID });
    }

    // Extract email for customer_email prefill (from body.email or metadata.contest_email)
    const customerEmail = req.body?.email || metadata?.contest_email || null;
    
    // Build session params - never use allow_promotion_codes with discounts
    const sessionParams = {
      mode: 'payment',
      line_items,
      success_url,
      cancel_url,
      metadata,
      locale: 'en',            // quiet the "./en" warning in the browser
      shipping_address_collection: {
        allowed_countries: ['US'], // ok to expand later
      },
      phone_number_collection: { enabled: true },
    };
    
    // Prefill customer email if available (improves UX for logged-in users)
    if (customerEmail && typeof customerEmail === 'string' && customerEmail.includes('@')) {
      sessionParams.customer_email = customerEmail.trim().toLowerCase();
      console.log('[CHECKOUT] Prefilling customer email:', sessionParams.customer_email);
    }

    // Only set discounts OR allow_promotion_codes, never both
    if (appliedDiscount && discounts.length > 0) {
      sessionParams.discounts = discounts;
      // Omit allow_promotion_codes when discounts are applied
    } else {
      sessionParams.allow_promotion_codes = false;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[CHECKOUT_ERR]', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      stripeErrorCode: err.code || err.type || null,
      product: req.body?.product || 'unknown',
      priceId: PRICE_BY_PRODUCT[req.body?.product] || 'unknown',
      ref: req.body?.ref || req.body?.referralCode || 'none',
    });

    // Part 3: Return structured error with visible diagnostics
    const errorResponse = {
      error: 'Failed to create checkout session',
      detail: err.message || String(err),
      stripeMode: envConfig?.STRIPE_MODE || 'unknown',
      stripeKeyLast6: envConfig?.STRIPE_KEY_FINGERPRINT || 'unknown',
      product: req.body?.product || null,
      priceId: PRICE_BY_PRODUCT[req.body?.product] || null,
      ref: req.body?.ref || req.body?.referralCode || null,
      siteUrl: envConfig?.SITE_URL || null,
    };

    // Add Stripe error code if present
    if (err.code || err.type) {
      errorResponse.stripeErrorCode = err.code || err.type;
    }

    // Add request ID if present
    if (err.requestId) {
      errorResponse.requestId = err.requestId;
    }

    return res.status(500).json(errorResponse);
  }
};
