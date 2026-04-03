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

// Import Prisma for user lookup and discount code persistence
const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');
const { normalizeEmail, normalizeReferralCode } = require('../src/lib/normalize.cjs');
const { isSelfOwnedCode, normalizeIdentityEmail } = require('../src/lib/selfReferralGuards.cjs');

// Part B1: Referral attribution window (30 days)
const REFERRAL_ATTRIBUTION_WINDOW_DAYS = 30;
const REFERRAL_ATTRIBUTION_WINDOW_MS = REFERRAL_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Log allowlist configuration at startup
console.log('[CHECKOUT_CONFIG] Discount code allowlist configuration:', {
  mode: envConfig.ASSOCIATE_REF_ALLOWLIST_MODE,
  allowlistLength: envConfig.ASSOCIATE_REF_ALLOWLIST.length,
  note: 'Allowlist codes are not logged for security',
});

// Strict product-to-price mapping (no fallbacks)
const PRICE_BY_PRODUCT = {
  paperback: envConfig.STRIPE_PRICE_PAPERBACK,
  ebook: envConfig.STRIPE_PRICE_EBOOK,
  audio_preorder: envConfig.STRIPE_PRICE_AUDIO_PREORDER,
};

/**
 * Validate associate publisher ref (canonical: check User table first)
 * Returns { valid: boolean, method: 'database' | 'allowlist' | 'format' | null, referrerUserId?: string }
 * 
 * Key rules:
 * - Ref is optional (checkout proceeds even if missing/invalid)
 * - Canonical rule: Any existing User.code is always valid
 * - Format validation: 4-12 alphanumeric characters
 * - Database check: Look up User by code or referralCode
 * - Allowlist fallback: For backward compatibility
 */
async function isValidAssociatePublisherRef(ref) {
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

  // B) Canonical validation: Check if code exists in User table
  // This is the primary validation - any User.code is valid by default
  if (prisma) {
    try {
      ensureDatabaseUrl();
      const refUser = await prisma.user.findFirst({
        where: {
          OR: [
            { code: normalizedRef },
            { referralCode: normalizedRef },
          ],
        },
        select: {
          id: true,
          email: true,
          code: true,
          referralCode: true,
        },
      });

      if (refUser) {
        console.log('[CHECKOUT_REF] Code found in database', {
          code: normalizedRef,
          userId: refUser.id,
          userCode: refUser.code,
          userReferralCode: refUser.referralCode,
        });
        return {
          valid: true,
          method: 'database',
          referrerUserId: refUser.id,
          referrerEmail: refUser.email || null,
        };
      }
    } catch (dbErr) {
      console.warn('[CHECKOUT_REF] Database lookup failed, falling back to allowlist', {
        error: dbErr.message,
        code: normalizedRef,
      });
      // Fall through to allowlist check
    }
  }

  // C) Fallback: Allowlist validation (for backward compatibility)
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
    // Part G3: Validate product parameter (REQUIRED - no defaults)
    const product = req.body?.product;
    if (!product || typeof product !== 'string') {
      console.error('[CHECKOUT] ❌ Missing product identifier', {
        userId: req.body?.userId || 'unknown',
        email: req.body?.email || req.body?.metadata?.contest_email || 'unknown',
        product: product || 'missing',
        bodyKeys: Object.keys(req.body || {}),
      });
      return res.status(400).json({ 
        error: 'Missing product identifier. Product must be explicitly specified.',
        details: 'Product is required and cannot be inferred or defaulted.'
      });
    }
    
    if (!(product in PRICE_BY_PRODUCT)) {
      console.error('[CHECKOUT] ❌ Invalid product identifier', {
        product,
        validProducts: Object.keys(PRICE_BY_PRODUCT),
      });
      return res.status(400).json({ 
        error: `Invalid product: ${product}. Must be one of: ${Object.keys(PRICE_BY_PRODUCT).join(', ')}` 
      });
    }

    // Resolve and validate priceId (no fallback to STRIPE_PRICE_ID)
    const priceId = PRICE_BY_PRODUCT[product];
    if (!priceId || !priceId.startsWith('price_')) {
      return res.status(500).json({ 
        error: `Missing Stripe price env for product=${product}. Check STRIPE_PRICE_${product.toUpperCase()}` 
      });
    }

    // ===== DISCOUNT CODE RESOLUTION (Priority: request > stored > none) =====
    const metadata = (req.body && req.body.metadata) || {};
    const customerEmail = req.body?.email || metadata?.contest_email || null;
    
    // [PRINCIPAL] Identify canonical User principal for checkout
    let user = null;
    let discountCodeSource = 'none';
    let discountCodeToUse = null;
    let principalResolutionMethod = 'none';
    
    if (prisma) {
      try {
        ensureDatabaseUrl();
        
        // Priority 1: Try to identify user by contest_user_id (canonical - from cookie)
        const contestUserId = metadata?.contest_user_id;
        if (contestUserId && typeof contestUserId === 'string' && contestUserId.trim()) {
          user = await prisma.user.findUnique({
            where: { id: contestUserId.trim() },
            select: { 
              id: true, 
              email: true, 
              code: true, 
              preferredDiscountCode: true,
              lastReferredByUserId: true,
              lastReferralCode: true,
              lastReferralAt: true,
              lastReferralSource: true,
            },
          });
          if (user) {
            discountCodeSource = 'contest_user_id';
            principalResolutionMethod = 'contest_user_id';
            console.log('[PRINCIPAL] Principal resolved by contest_user_id', { 
              userId: user.id, 
              email: user.email,
              code: user.code,
            });
          } else {
            console.warn('[PRINCIPAL] MISMATCH - contest_user_id provided but User not found', { 
              contestUserId: contestUserId.trim() 
            });
          }
        }
        
        // Priority 2: Fallback - Try by contest_user_code
        if (!user && metadata?.contest_user_code) {
          const contestUserCode = normalizeReferralCode(metadata.contest_user_code);
          if (contestUserCode) {
            user = await prisma.user.findUnique({
              where: { code: contestUserCode },
              select: { 
                id: true, 
                email: true, 
                code: true, 
                preferredDiscountCode: true,
                lastReferredByUserId: true,
                lastReferralCode: true,
                lastReferralAt: true,
                lastReferralSource: true,
              },
            });
            if (user) {
              discountCodeSource = 'contest_user_code';
              principalResolutionMethod = 'contest_user_code';
              console.log('[PRINCIPAL] Principal resolved by contest_user_code', { 
                userId: user.id, 
                email: user.email,
                code: user.code,
              });
            }
          }
        }
        
        // Priority 3: Fallback - Try by email (non-canonical, but better than nothing)
        if (!user && customerEmail) {
          const normalizedEmail = normalizeEmail(customerEmail);
          if (normalizedEmail) {
            user = await prisma.user.findUnique({
              where: { email: normalizedEmail },
              select: { 
                id: true, 
                email: true, 
                code: true, 
                preferredDiscountCode: true,
                lastReferredByUserId: true,
                lastReferralCode: true,
                lastReferralAt: true,
                lastReferralSource: true,
              },
            });
            if (user) {
              discountCodeSource = 'email';
              principalResolutionMethod = 'email_fallback';
              console.warn('[PRINCIPAL] Principal resolved by email fallback (contest_user_id missing)', { 
                userId: user.id, 
                email: user.email,
                code: user.code,
                warning: 'contest_user_id should be provided in metadata',
              });
            }
          }
        }
        
        // [PRINCIPAL] Log final resolution
        if (user) {
          console.log('[PRINCIPAL] Principal resolved for checkout', {
            userId: user.id,
            email: user.email,
            code: user.code,
            method: principalResolutionMethod,
            hasContestUserId: !!metadata?.contest_user_id,
            hasContestUserCode: !!metadata?.contest_user_code,
          });
        } else {
          console.warn('[PRINCIPAL] Principal NOT resolved - no User found', {
            contestUserId: metadata?.contest_user_id || 'MISSING',
            contestUserCode: metadata?.contest_user_code || 'MISSING',
            customerEmail: customerEmail || 'MISSING',
          });
        }
      } catch (userErr) {
        console.error('[PRINCIPAL] Error resolving principal', { error: userErr.message, stack: userErr.stack });
        // Continue without user - discount code persistence is non-blocking
      }
    }
    
    function isSelfOwnedDiscountCandidate(codeValidation, sourceLabel, codeValue) {
      if (!codeValidation?.valid) return false;
      if (!user) return false;
      const blocked = isSelfOwnedCode({
        buyerEmail: user.email || customerEmail || null,
        ownerEmail: codeValidation.referrerEmail || null,
        buyerUserId: user.id || null,
        ownerUserId: codeValidation.referrerUserId || null,
      });
      if (blocked) {
        console.warn('[SELF_REFERRAL_GUARD] self_owned_code_blocked_at_checkout', {
          buyerUserId: user.id || null,
          buyerEmail: normalizeIdentityEmail(user.email || customerEmail || null),
          ownerUserId: codeValidation.referrerUserId || null,
          ownerEmail: normalizeIdentityEmail(codeValidation.referrerEmail || null),
          code: normalizeReferralCode(codeValue || '') || null,
          source: sourceLabel,
        });
      }
      return blocked;
    }

    // Part B2: Determine discount code priority: explicit ref > latest active referral > stored preferredDiscountCode > none
    const refRaw = req.body?.ref || req.body?.referralCode || '';
    // Filter out placeholder values like '...' or empty strings
    const requestCode = refRaw && refRaw.trim() && refRaw.trim() !== '...' ? refRaw.trim() : null;
    
    // Check if buyer has an active lastReferral (within attribution window)
    let activeLastReferral = null;
    if (user && user.lastReferralAt && user.lastReferralCode) {
      const referralAgeMs = Date.now() - new Date(user.lastReferralAt).getTime();
      if (referralAgeMs <= REFERRAL_ATTRIBUTION_WINDOW_MS) {
        activeLastReferral = {
          code: user.lastReferralCode,
          userId: user.lastReferredByUserId,
          source: user.lastReferralSource || 'unknown',
          ageDays: Math.floor(referralAgeMs / (24 * 60 * 60 * 1000)),
        };
        console.log('[CHECKOUT_DISCOUNT] Found active lastReferral', {
          code: activeLastReferral.code,
          ageDays: activeLastReferral.ageDays,
          source: activeLastReferral.source,
          userId: user.id,
        });
      } else {
        console.log('[CHECKOUT_DISCOUNT] lastReferral expired', {
          code: user.lastReferralCode,
          ageDays: Math.floor(referralAgeMs / (24 * 60 * 60 * 1000)),
          windowDays: REFERRAL_ATTRIBUTION_WINDOW_DAYS,
          userId: user.id,
        });
      }
    }
    
    // Baseline rule: first discount code associated with customer persists unless manually overridden.
    // When request code is invalid, fall back to persisted valid code so Stripe discount aligns with webhook attribution.
    if (requestCode) {
      const requestValid = await isValidAssociatePublisherRef(requestCode);
      if (requestValid.valid && !isSelfOwnedDiscountCandidate(requestValid, 'request', requestCode)) {
        discountCodeToUse = requestCode;
        discountCodeSource = 'request';
        console.log('[CHECKOUT_DISCOUNT] Using code from request', { code: discountCodeToUse });
      } else {
        // Request code invalid - fall back to persisted valid code (aligns Stripe with webhook attribution)
        if (activeLastReferral) {
          const refValid = await isValidAssociatePublisherRef(activeLastReferral.code);
          if (refValid.valid && !isSelfOwnedDiscountCandidate(refValid, 'last_referral_fallback', activeLastReferral.code)) {
            discountCodeToUse = activeLastReferral.code;
            discountCodeSource = 'last_referral_fallback';
            console.log('[CHECKOUT_DISCOUNT] Request code invalid, using persisted lastReferral', {
              requestCode,
              fallbackCode: discountCodeToUse,
              userId: user.id,
            });
          } else if (user?.preferredDiscountCode) {
            const prefValid = await isValidAssociatePublisherRef(user.preferredDiscountCode);
            if (prefValid.valid && !isSelfOwnedDiscountCandidate(prefValid, 'stored_fallback', user.preferredDiscountCode)) {
              discountCodeToUse = user.preferredDiscountCode;
              discountCodeSource = 'stored_fallback';
              console.log('[CHECKOUT_DISCOUNT] Request and lastReferral invalid, using preferredDiscountCode', {
                requestCode,
                fallbackCode: discountCodeToUse,
                userId: user.id,
              });
            }
          }
        } else if (user?.preferredDiscountCode) {
          const prefValid = await isValidAssociatePublisherRef(user.preferredDiscountCode);
          if (prefValid.valid && !isSelfOwnedDiscountCandidate(prefValid, 'stored_fallback', user.preferredDiscountCode)) {
            discountCodeToUse = user.preferredDiscountCode;
            discountCodeSource = 'stored_fallback';
            console.log('[CHECKOUT_DISCOUNT] Request code invalid, using preferredDiscountCode', {
              requestCode,
              fallbackCode: discountCodeToUse,
              userId: user.id,
            });
          }
        }
        if (!discountCodeToUse) {
          console.log('[CHECKOUT_DISCOUNT] Request code invalid, no valid persisted code', { requestCode });
        }
      }
    } else if (activeLastReferral) {
      const activeRefValid = await isValidAssociatePublisherRef(activeLastReferral.code);
      if (activeRefValid.valid && !isSelfOwnedDiscountCandidate(activeRefValid, 'last_referral', activeLastReferral.code)) {
        discountCodeToUse = activeLastReferral.code;
        discountCodeSource = 'last_referral';
        console.log('[CHECKOUT_DISCOUNT] Using active lastReferral', {
          code: discountCodeToUse,
          source: activeLastReferral.source,
          ageDays: activeLastReferral.ageDays,
          userId: user.id,
        });
      } else {
        console.log('[CHECKOUT_DISCOUNT] Skipping active lastReferral (invalid or self-owned)', {
          code: activeLastReferral.code,
          userId: user?.id || null,
        });
      }
    } else if (user?.preferredDiscountCode) {
      const prefValid = await isValidAssociatePublisherRef(user.preferredDiscountCode);
      if (prefValid.valid && !isSelfOwnedDiscountCandidate(prefValid, 'stored', user.preferredDiscountCode)) {
        discountCodeToUse = user.preferredDiscountCode;
        discountCodeSource = 'stored';
        console.log('[CHECKOUT_DISCOUNT] Using stored preferredDiscountCode', { code: discountCodeToUse, userId: user.id });
      } else {
        console.log('[CHECKOUT_DISCOUNT] Skipping stored preferredDiscountCode (invalid or self-owned)', {
          code: user.preferredDiscountCode,
          userId: user?.id || null,
        });
      }
    } else {
      discountCodeToUse = null;
      discountCodeSource = 'none';
      console.log('[CHECKOUT_DISCOUNT] No discount code available', { userId: user?.id || 'no_user' });
    }
    
    // Validate discount code if present
    let appliedDiscount = false;
    let refValidationResult = { valid: false, method: null, reason: 'no_code' };
    
    if (discountCodeToUse) {
      refValidationResult = await isValidAssociatePublisherRef(discountCodeToUse);
      appliedDiscount = refValidationResult.valid;
      
      if (appliedDiscount) {
        const selfOwnedAtValidation = isSelfOwnedDiscountCandidate(refValidationResult, 'final_validation', discountCodeToUse);
        if (selfOwnedAtValidation) {
          appliedDiscount = false;
          refValidationResult.valid = false;
          refValidationResult.reason = 'self_owned_code_blocked';
        }
      }

      if (appliedDiscount) {
        refValidationResult.reason = `valid_${refValidationResult.method}`;
      } else {
        refValidationResult.reason = refValidationResult.reason || 'invalid_format_or_not_in_allowlist';
      }
      
      console.log('[CHECKOUT_DISCOUNT] Validation result', {
        code: discountCodeToUse.toUpperCase(),
        source: discountCodeSource,
        valid: refValidationResult.valid,
        method: refValidationResult.method,
        reason: refValidationResult.reason,
        allowlistHit: refValidationResult.method === 'allowlist',
        allowlistMode: envConfig.ASSOCIATE_REF_ALLOWLIST_MODE,
        allowlistCount: envConfig.ASSOCIATE_REF_ALLOWLIST.length,
      });
      
      // Persist valid code: first discount code associated with customer persists unless manually overridden
      const codeToPersist = (discountCodeToUse || '').trim().toUpperCase();
      if (user && appliedDiscount && codeToPersist && user.preferredDiscountCode !== codeToPersist) {
        try {
          ensureDatabaseUrl();
          await prisma.user.update({
            where: { id: user.id },
            data: { preferredDiscountCode: codeToPersist },
          });
          console.log('[CHECKOUT_DISCOUNT] Persisted preferredDiscountCode', {
            userId: user.id,
            oldCode: user.preferredDiscountCode || 'none',
            newCode: codeToPersist,
            source: discountCodeSource,
          });
        } catch (updateErr) {
          console.warn('[CHECKOUT_DISCOUNT] Failed to update preferredDiscountCode', {
            error: updateErr.message,
            userId: user.id,
          });
          // Non-blocking - continue with checkout
        }
      }
    } else {
      console.log('[CHECKOUT_DISCOUNT] No discount code to validate', {
        source: discountCodeSource,
        userId: user?.id || 'no_user',
      });
    }

    // Text-a-friend landing link (?discount=15): apply associate 15% Stripe coupon when no referral discount applies
    const textafriendDiscount = req.body?.textafriendDiscount === true;
    if (textafriendDiscount && !appliedDiscount && envConfig.STRIPE_ASSOCIATE_15_COUPON_ID) {
      appliedDiscount = true;
      discountCodeSource = 'textafriend_15';
      console.log('[CHECKOUT_DISCOUNT] Text-a-friend 15% coupon (no referral code)', {
        userId: user?.id || 'no_user',
      });
    } else if (textafriendDiscount && appliedDiscount) {
      console.log('[CHECKOUT_DISCOUNT] textafriendDiscount flag ignored (referral discount already applied)', {
        userId: user?.id || 'no_user',
      });
    } else if (textafriendDiscount && !envConfig.STRIPE_ASSOCIATE_15_COUPON_ID) {
      console.warn('[CHECKOUT_DISCOUNT] textafriendDiscount requested but STRIPE_ASSOCIATE_15_COUPON_ID is not set');
    }

    console.log('[CHECKOUT_START_SERVER]', { 
      product, 
      priceId, 
      discountCode: discountCodeToUse || 'none',
      discountCodeSource,
      appliedDiscount,
      appliedDiscountReason: refValidationResult.reason,
      refValid: refValidationResult.valid,
      refMethod: refValidationResult.method,
      userId: user?.id || 'no_user',
    });

    const qty = Math.max(1, Number(req.body?.qty || 1));
    const successPath = req.body?.successPath || '/contest/thank-you';
    const cancelPath  = req.body?.cancelPath  || '/contest';

    // Add product, ref, and tracking params to metadata
    metadata.product = product;
    if (discountCodeToUse && appliedDiscount) {
      metadata.ref = discountCodeToUse.toUpperCase();
      metadata.ref_valid = appliedDiscount ? 'true' : 'false';
    }
    // Part B2: Add AP referral metadata for webhook attribution
    if (activeLastReferral && appliedDiscount && activeLastReferral.userId) {
      metadata.ap_referral_code = activeLastReferral.code;
      metadata.ap_user_id = activeLastReferral.userId;
      metadata.referral_at = user.lastReferralAt.toISOString();
      metadata.referral_source = activeLastReferral.source;
      console.log('[CHECKOUT_DISCOUNT] Added AP referral metadata', {
        ap_referral_code: metadata.ap_referral_code,
        ap_user_id: metadata.ap_user_id,
        referral_source: metadata.referral_source,
      });
    }
    if (req.body?.src) metadata.src = req.body.src;
    if (req.body?.v) metadata.v = req.body.v;
    if (req.body?.origin) metadata.origin = req.body.origin;
    if (textafriendDiscount && discountCodeSource === 'textafriend_15') {
      metadata.discount_source = 'textafriend';
      metadata.discount_pct = '15';
    }

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

    // customerEmail already extracted above for user lookup
    
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

    // Root Cause C Fix: Checkout session must always be newly created (never reuse)
    // stripe.checkout.sessions.create() always creates a new session - this is correct
    const session = await stripe.checkout.sessions.create(sessionParams);
    
    console.log('[CHECKOUT] New checkout session created', {
      sessionId: session.id,
      url: session.url,
      product,
      note: 'Session is always newly created (never reused)',
    });

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
