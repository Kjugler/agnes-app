// deepquill/api/create-checkout-session.cjs
// Use centralized Stripe client and env config
const { stripe } = require('../src/lib/stripe.cjs');
const envConfig = require('../src/config/env.cjs');
const { normalizeReferralCode, normalizeEmail } = require('../src/lib/normalize.cjs');

// Strict product-to-price mapping (no fallbacks)
const PRICE_BY_PRODUCT = {
  paperback: envConfig.STRIPE_PRICE_PAPERBACK,
  ebook: envConfig.STRIPE_PRICE_EBOOK,
  audio_preorder: envConfig.STRIPE_PRICE_AUDIO_PREORDER,
};

// Use single Prisma singleton with explicit datasourceUrl
const { prisma, datasourceUrl, ensureDatabaseUrl } = require('../server/prisma.cjs');

// CRITICAL: Ensure DATABASE_URL is ALWAYS set before any Prisma query
ensureDatabaseUrl();

/**
 * Validate associate publisher ref using Prisma (with allowlist fallback)
 * Returns { valid: boolean, method: 'prisma' | 'allowlist' | 'any' | null }
 */
async function isValidAssociatePublisherRef(ref) {
  // Safely normalize referral code
  const normalizedRef = normalizeReferralCode(ref);
  if (!normalizedRef) {
    return { valid: false, method: null };
  }

  // Try Prisma first (if available)
  if (prisma) {
    try {
      ensureDatabaseUrl(); // Ensure before query
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
  const isDevOrTest = process.env.NODE_ENV === 'development' || envConfig.STRIPE_MODE === 'test';
  const devFormatMatch = /^[A-Z0-9]{6}$/i.test(normalizedRef);

  // Dev/test mode fallback: accept codes matching allowlist OR dev format (6 alphanumeric chars)
  // This allows testing with real associate codes even when Prisma unavailable
  if (isDevOrTest && !prisma && allowlistMode === 'allowlist') {
    const inAllowlist = allowlist.includes(normalizedRef);
    // Accept if in allowlist OR matches dev format (regardless of allowlist count)
    const valid = Boolean(inAllowlist) || devFormatMatch;
    const method = inAllowlist ? 'allowlist' : (devFormatMatch ? 'dev-format' : null);
    return { valid, method };
  }

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

    // Get referral code (check multiple sources: refCode, ref, referralCode)
    const refRaw = req.body?.refCode || req.body?.ref || req.body?.referralCode || '';
    const ref = refRaw ? refRaw.trim() : '';
    const refSource = req.body?.refSource || req.body?.src || '';
    const refVariant = req.body?.refVariant || req.body?.v || '';
    const lockEmail = req.body?.lockEmail !== undefined ? req.body.lockEmail : true; // Default to true for backward compatibility
    const checkoutEmail = req.body?.checkoutEmail || null; // Email captured from referral checkout form
    
    // Get canonical contest user identifiers (PRIMARY for attribution)
    const contestUserId = req.body?.contestUserId || null; // User.id - PRIMARY KEY
    const contestUserCode = req.body?.contestUserCode || null; // User.code - fallback
    const contestEmail = req.body?.contestEmail || null; // For email sending only
    
    // Validate ref if present
    let appliedDiscount = false;
    let refValidationResult = { valid: false, method: null };
    if (ref) {
      refValidationResult = await isValidAssociatePublisherRef(ref);
      appliedDiscount = refValidationResult.valid;
      
      const isDevOrTest = process.env.NODE_ENV === 'development' || envConfig.STRIPE_MODE === 'test';
      const devFormatMatch = /^[A-Z0-9]{6}$/i.test(ref.toUpperCase());
      
      console.log('[CHECKOUT_REF]', {
        ref: ref.toUpperCase(),
        refSource,
        refVariant,
        valid: refValidationResult.valid,
        prisma: !!prisma,
        method: refValidationResult.method,
        allowlistHit: refValidationResult.method === 'allowlist',
        allowlistMode: envConfig.ASSOCIATE_REF_ALLOWLIST_MODE,
        allowlistCount: envConfig.ASSOCIATE_REF_ALLOWLIST.length,
        devFormatMatch,
        isDevOrTest,
      });
    }
    
    // Debug logging: product selection and price mapping (after ref and appliedDiscount are set)
    console.log('[CHECKOUT_PRODUCT]', {
      product,
      priceId: priceId || 'MISSING',
      ref: ref || 'none',
      appliedDiscount,
      priceMapping: Object.keys(PRICE_BY_PRODUCT).map(k => ({ [k]: PRICE_BY_PRODUCT[k] })),
    });
    
    console.log('[CHECKOUT_START_SERVER]', { 
      product, 
      priceId, 
      ref: ref || 'none',
      refSource: refSource || 'none',
      refVariant: refVariant || 'none',
      appliedDiscount,
      refValid: refValidationResult.valid,
      refMethod: refValidationResult.method,
      lockEmail,
      checkoutEmail: checkoutEmail || 'none',
      couponId: envConfig.STRIPE_ASSOCIATE_15_COUPON_ID || 'NOT_SET',
      discountsArray: appliedDiscount && envConfig.STRIPE_ASSOCIATE_15_COUPON_ID ? [{ coupon: envConfig.STRIPE_ASSOCIATE_15_COUPON_ID }] : [],
    });

    const qty = Math.max(1, Number(req.body?.qty || 1));
    const successPath = req.body?.successPath || '/contest/thank-you';
    const cancelPath  = req.body?.cancelPath  || '/contest';
    
    // Build canonical metadata object with consistent keys
    // This is the SINGLE SOURCE OF TRUTH for webhook attribution
    const metadata = {
      // PRIMARY ATTRIBUTION KEYS (required for points/credits)
      contest_user_id: contestUserId || '', // PRIMARY KEY - User.id
      contest_user_code: contestUserCode || '', // Fallback - User.code
      contest_email: contestEmail || '', // For email sending only, NOT for attribution
      
      // PRODUCT & ACTION
      product: product, // ebook, paperback, audio_preorder
      action: 'buy_book',
      
      // REFERRAL TRACKING
      ref: ref ? ref.toUpperCase() : '',
      referrerCode: ref ? ref.toUpperCase() : '', // Alias for webhook clarity
      ref_valid: ref ? (appliedDiscount ? 'true' : 'false') : 'false',
      refSource: refSource || '',
      refVariant: refVariant || '',
      
      // TRACKING PARAMS
      src: req.body?.src || refSource || '',
      v: req.body?.v || refVariant || '',
      origin: req.body?.origin || '',
      
      // LEGACY/COMPATIBILITY (merge any existing metadata, but canonical keys take precedence)
      ...((req.body && req.body.metadata) || {}),
    };
    
    // Override with canonical values (ensure consistency)
    metadata.contest_user_id = contestUserId || '';
    metadata.contest_user_code = contestUserCode || '';
    metadata.contest_email = contestEmail || '';
    metadata.product = product;
    metadata.action = 'buy_book';
    if (ref) {
      metadata.ref = ref.toUpperCase();
      metadata.referrerCode = ref.toUpperCase();
      metadata.ref_valid = appliedDiscount ? 'true' : 'false';
    } else {
      metadata.ref_valid = 'false';
    }

    // We want users to land back on Next (via ngrok dev domain)
    // Still allow overriding via body if you want different pages per flow.
    const origin = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agnes-dev.ngrok-free.app';

    const success_url = `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${origin}${cancelPath}`;

    // Use priceId directly (already validated)
    const line_items = [{ price: priceId, quantity: qty }];
    
    // Log what we're sending to Stripe
    console.log('[CHECKOUT_STRIPE_SESSION] Creating session with:', {
      product,
      priceId,
      lineItems: line_items,
      appliedDiscount,
      discountsArray: appliedDiscount && envConfig.STRIPE_ASSOCIATE_15_COUPON_ID ? [{ coupon: envConfig.STRIPE_ASSOCIATE_15_COUPON_ID }] : [],
    });

    // Prepare discounts array for Stripe coupon (only if ref is valid)
    const discounts = [];
    if (appliedDiscount && envConfig.STRIPE_ASSOCIATE_15_COUPON_ID) {
      discounts.push({ coupon: envConfig.STRIPE_ASSOCIATE_15_COUPON_ID });
    }

    // Extract email for customer_email prefill
    // Priority: checkoutEmail (from referral form) > body.email > metadata.contest_email
    const customerEmailRaw = checkoutEmail || req.body?.email || metadata?.contest_email || null;
    const customerEmail = normalizeEmail(customerEmailRaw);
    const checkoutEmailNormalized = normalizeEmail(checkoutEmail);
    
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
    
    // Set customer_email based on available email sources
    // Priority: checkoutEmail (from referral form) > customerEmail (from logged-in user)
    if (checkoutEmailNormalized) {
      // checkoutEmail present: use it (user just entered it in referral form)
      sessionParams.customer_email = checkoutEmailNormalized;
      console.log('[CHECKOUT] Prefilling customer email from referral checkout form:', sessionParams.customer_email);
    } else if (lockEmail && customerEmail) {
      // Logged-in contest users: prefill and lock email
      sessionParams.customer_email = customerEmail;
      console.log('[CHECKOUT] Prefilling customer email (locked):', sessionParams.customer_email);
    } else if (!lockEmail) {
      // Referral traffic without checkoutEmail: allow user to enter their own email
      console.log('[CHECKOUT] Email field unlocked for referral traffic - user can enter their own email');
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
