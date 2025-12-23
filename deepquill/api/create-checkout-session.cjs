// deepquill/api/create-checkout-session.cjs
// Use centralized Stripe client and env config
const { stripe } = require('../src/lib/stripe.cjs');
const envConfig = require('../src/config/env.cjs');

// Strict product-to-price mapping (no fallbacks)
const PRICE_BY_PRODUCT = {
  paperback: envConfig.STRIPE_PRICE_PAPERBACK,
  ebook: envConfig.STRIPE_PRICE_EBOOK,
  audio_preorder: envConfig.STRIPE_PRICE_AUDIO_PREORDER,
};

// Try to load Prisma for ref validation
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (err) {
  console.warn('[CHECKOUT] Prisma not available, ref validation will be skipped:', err.message);
}

/**
 * Validate associate publisher ref using Prisma (with allowlist fallback)
 * Returns { valid: boolean, method: 'prisma' | 'allowlist' | 'any' | null }
 */
async function isValidAssociatePublisherRef(ref) {
  if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
    return { valid: false, method: null };
  }

  const normalizedRef = ref.trim().toUpperCase();

  // Try Prisma first (if available)
  if (prisma) {
    try {
      const user = await prisma.user.findUnique({
        where: {
          referralCode: normalizedRef,
        },
        select: {
          id: true,
        },
      });

      if (user !== null) {
        return { valid: true, method: 'prisma' };
      }
    } catch (error) {
      console.error('[CHECKOUT] Prisma validation error, falling back to allowlist', {
        ref: normalizedRef,
        error: error.message,
      });
      // Fall through to allowlist fallback
    }
  }

  // Fallback to allowlist when Prisma unavailable or ref not found in DB
  const allowlistMode = envConfig.ASSOCIATE_REF_ALLOWLIST_MODE;
  const allowlist = envConfig.ASSOCIATE_REF_ALLOWLIST || [];

  if (allowlistMode === 'any') {
    // In "any" mode, accept any ref that's at least 4 characters
    const valid = normalizedRef.length >= 4;
    return { valid, method: valid ? 'any' : null };
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

    // Get referral code
    const refRaw = req.body?.ref || req.body?.referralCode || '';
    const ref = refRaw ? refRaw.trim() : '';
    
    // Validate ref if present
    let appliedDiscount = false;
    let refValidationResult = { valid: false, method: null };
    if (ref) {
      refValidationResult = await isValidAssociatePublisherRef(ref);
      appliedDiscount = refValidationResult.valid;
      
      console.log('[CHECKOUT_REF]', {
        ref: ref.toUpperCase(),
        valid: refValidationResult.valid,
        prisma: !!prisma,
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

    // We want users to land back on Next (via ngrok dev domain)
    // Still allow overriding via body if you want different pages per flow.
    const origin = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agnes-dev.ngrok-free.app';

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
      stripeErrorCode: err.code || err.type || null,
      product: req.body?.product || 'unknown',
      priceId: PRICE_BY_PRODUCT[req.body?.product] || 'unknown',
      ref: req.body?.ref || req.body?.referralCode || 'none',
    });

    // Return structured error with safe diagnostics
    const errorResponse = {
      error: 'Failed to create checkout session',
      stripeMode: envConfig.STRIPE_MODE,
      stripeKeyLast6: envConfig.STRIPE_KEY_FINGERPRINT,
      product: req.body?.product || null,
      priceId: PRICE_BY_PRODUCT[req.body?.product] || null,
      ref: req.body?.ref || req.body?.referralCode || null,
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
