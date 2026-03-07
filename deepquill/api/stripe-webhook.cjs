// deepquill/api/stripe-webhook.cjs
// Stripe webhook handler - verifies signatures and processes events

const express = require('express');
const mailchimp = require('@mailchimp/mailchimp_transactional');
const { stripe } = require('../src/lib/stripe.cjs');
const { STRIPE_WEBHOOK_SECRET } = require('../src/config/env.cjs');
const { logFulfillment } = require('../src/lib/fulfillmentLogger.cjs');
const { buildPurchaseConfirmationEmail } = require('../src/lib/purchaseEmail.cjs');
const { buildReferrerCommissionEmail } = require('../src/lib/referrerCommissionEmail.cjs');
const { applyGlobalEmailBanner } = require('../src/lib/emailBanner.cjs');
const { normalizeEmail, normalizeReferralCode, extractNameFromEmail } = require('../src/lib/normalize.cjs');
const envConfig = require('../src/config/env.cjs');
const { awardPurchaseDailyPoints, awardReferralSponsorPoints } = require('../lib/points/awardPoints.cjs');
const { recordLedgerEntry } = require('../lib/ledger/recordLedger.cjs');
const { getPointsRollupForUser } = require('../lib/pointsRollup.cjs');

// Use single Prisma singleton with explicit datasourceUrl
const { prisma, datasourceUrl, dbPath, ensureDatabaseUrl } = require('../server/prisma.cjs');
const fs = require('fs');

// CRITICAL: Ensure DATABASE_URL is ALWAYS set before any Prisma query
// The adapter reads DATABASE_URL at query time, not just initialization
ensureDatabaseUrl();

// Debug log at webhook startup to prove DATABASE_URL is set
console.log('[WEBHOOK_DB] datasourceUrl =', datasourceUrl);
console.log('[WEBHOOK_DB] dbPath =', dbPath);
console.log('[WEBHOOK_DB] db exists =', fs.existsSync(dbPath));
console.log('[WEBHOOK_DB] process.env.DATABASE_URL =', process.env.DATABASE_URL);

const router = express.Router();

// Get Mailchimp client for sending emails
function getMailchimpClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[WEBHOOK] MAILCHIMP_TRANSACTIONAL_KEY missing - purchase emails will not be sent');
    return null;
  }
  return mailchimp(apiKey);
}

/**
 * Normalize Mailchimp Transactional API response to canonical delivery outcome
 * 
 * Maps Mailchimp response to:
 * - deliveryStatus: sent | queued | rejected | error
 * - providerMessageId: _id if present
 * - rejectReason: reject_reason if present
 * - queuedReason: queued_reason if present
 * 
 * @param {any} emailResult - Mailchimp API response (array or object)
 * @returns {object} Normalized delivery outcome
 */
function normalizeEmailDeliveryOutcome(emailResult) {
  // Default outcome
  let outcome = {
    deliveryStatus: 'error',
    providerMessageId: 'unknown',
    rejectReason: null,
    queuedReason: null,
    rawStatus: 'unknown',
  };

  try {
    // Handle array response (most common for Mandrill)
    let firstResult = null;
    if (Array.isArray(emailResult) && emailResult.length > 0) {
      firstResult = emailResult[0];
    } else if (emailResult && typeof emailResult === 'object') {
      firstResult = emailResult;
    }

    if (firstResult) {
      const status = firstResult.status || 'unknown';
      outcome.rawStatus = status;
      outcome.providerMessageId = firstResult._id || firstResult.id || firstResult.messageId || 'unknown';
      outcome.rejectReason = firstResult.reject_reason || null;
      outcome.queuedReason = firstResult.queued_reason || null;

      // Map status to canonical deliveryStatus
      if (status === 'sent') {
        outcome.deliveryStatus = 'sent';
      } else if (status === 'queued') {
        outcome.deliveryStatus = 'queued';
      } else if (status === 'rejected') {
        outcome.deliveryStatus = 'rejected';
      } else if (status === 'invalid' || status === 'error' || status === 'bounced') {
        outcome.deliveryStatus = 'error';
      } else {
        // Unknown status - treat as error
        outcome.deliveryStatus = 'error';
      }
    } else {
      // Unexpected response format
      outcome.deliveryStatus = 'error';
    }
  } catch (err) {
    // Error parsing response - treat as error
    outcome.deliveryStatus = 'error';
    outcome.rejectReason = `Parse error: ${err.message}`;
  }

  return outcome;
}

// IMPORTANT: Use express.raw() to preserve exact body bytes for signature verification
// This MUST be mounted before any JSON parsing middleware
router.post(
  '/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // ===== STEP 1: TOP-OF-HANDLER LOGGING =====
    const timestamp = new Date().toISOString();
    console.log('='.repeat(80));
    console.log(`WEBHOOK HIT deepquill stripe-webhook.cjs @ ${timestamp}`);
    console.log(`Request URL: ${req.url}`);
    console.log(`Request method: ${req.method}`);
    console.log(`Stripe-Signature header present: ${!!req.headers['stripe-signature']}`);
    console.log(`Content-Type: ${req.headers['content-type']}`);
    console.log(`Content-Length: ${req.headers['content-length']}`);
    
    // CRITICAL: Log body type and size for signature verification debugging
    const bodyType = typeof req.body;
    const bodyIsBuffer = Buffer.isBuffer(req.body);
    const bodyLength = bodyIsBuffer ? req.body.length : (typeof req.body === 'string' ? req.body.length : 'unknown');
    console.log(`[WEBHOOK] Body type: ${bodyType}, isBuffer: ${bodyIsBuffer}, length: ${bodyLength}`);
    
    // Log first 100 chars of body (safe - no secrets) for debugging
    let bodyPreview = 'N/A';
    if (Buffer.isBuffer(req.body)) {
      bodyPreview = req.body.toString('utf8', 0, Math.min(100, req.body.length));
    } else if (typeof req.body === 'string') {
      bodyPreview = req.body.substring(0, 100);
    }
    console.log(`[WEBHOOK] Body preview (first 100 chars): ${bodyPreview}...`);
    
    console.log('='.repeat(80));
    
    try {
      const sig = req.headers['stripe-signature'];
      
      if (!sig) {
        console.error('[WEBHOOK] Missing stripe-signature header');
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      if (!STRIPE_WEBHOOK_SECRET) {
        console.error('[WEBHOOK] STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      // BULLETPROOF: express.raw() guarantees req.body is a Buffer
      // Use it directly - no conversion, no stringification, no modification
      if (!Buffer.isBuffer(req.body)) {
        console.error('[WEBHOOK] FATAL: req.body is not a Buffer!', {
          type: typeof req.body,
          isBuffer: Buffer.isBuffer(req.body),
          constructor: req.body?.constructor?.name,
        });
        return res.status(500).json({ 
          error: 'Internal error: body not in Buffer format',
          detail: 'express.raw() middleware should provide Buffer, but it did not'
        });
      }

      // Verify signature and construct event using Buffer directly
      // stripe.webhooks.constructEvent() accepts Buffer or string - Buffer is preferred
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body, // Use Buffer directly - no conversion
          sig,
          STRIPE_WEBHOOK_SECRET
        );
        console.log('✅ [WEBHOOK] Verified signature successfully');
        console.log('[WEBHOOK] Using secret:', STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...');
        console.log('[WEBHOOK] Body verified as Buffer, length:', req.body.length);
      } catch (err) {
        console.error('❌ [WEBHOOK] Signature verification failed:', err.message);
        console.error('[WEBHOOK] Expected secret:', STRIPE_WEBHOOK_SECRET ? STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...' : 'NOT SET');
        console.error('[WEBHOOK] Body type used for verification:', Buffer.isBuffer(req.body) ? 'Buffer' : typeof req.body);
        console.error('[WEBHOOK] Body length used for verification:', req.body.length);
        console.error('[WEBHOOK] Signature header:', sig ? sig.substring(0, 50) + '...' : 'MISSING');
        return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      }

      // ===== STEP 2: LOG EVENT.TYPE AND CRITICAL IDs =====
      const eventMode = event.livemode ? 'live' : 'test';
      console.log('[WEBHOOK] Event received:', {
        type: event.type,
        id: event.id,
        mode: eventMode,
        livemode: event.livemode,
      });
      
      // Log event type for debugging
      console.log('[WEBHOOK] Processing event type:', event.type);

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed': {
          try {
            const session = event.data.object;
            
            // ===== INSTRUMENTATION: START checkout.session.completed =====
            console.log('[WEBHOOK] checkout.session.completed START evt=' + event.id);
            
            // Extract email with multiple fallbacks (preferred order)
            let customerEmail = null;
            let emailSource = 'MISSING';
            if (session.customer_details?.email) {
              customerEmail = session.customer_details.email;
              emailSource = 'customer_details.email';
            } else if (session.customer_email) {
              customerEmail = session.customer_email;
              emailSource = 'customer_email';
            } else if (session.customer && typeof session.customer === 'object' && session.customer.email) {
              customerEmail = session.customer.email;
              emailSource = 'customer.email';
            }
            
            console.log('[WEBHOOK] session.id=' + session.id + ' email=' + (customerEmail || 'MISSING') + ' amount_total=' + (session.amount_total || 0));
            console.log('[WEBHOOK] Buyer email source: ' + emailSource);
          
          // Extract shipping/contact details from session
          // Priority: shipping_details > customer_details > billing_details
          const shippingDetails = session.shipping_details || session.shipping || null;
          const customerDetails = session.customer_details || null;
          
          // Extract shipping address
          const shippingAddr = shippingDetails?.address || customerDetails?.address || null;
          const shippingName = shippingDetails?.name || customerDetails?.name || null;
          const shippingPhone = shippingDetails?.phone || customerDetails?.phone || null;
          
          // Extract billing details as fallback
          const billingDetails = session.billing_details || null;
          const billingEmail = billingDetails?.email || customerEmail;
          const billingName = billingDetails?.name || shippingName;
          const billingPhone = billingDetails?.phone || shippingPhone;
          
          // Final values (prefer shipping, fallback to billing)
          const finalEmail = customerEmail || billingEmail;
          const finalName = shippingName || billingName;
          const finalPhone = shippingPhone || billingPhone;
          const finalAddress = shippingAddr || billingDetails?.address || null;
          
          // ===== STEP 2 CONTINUED: LOG SESSION DETAILS =====
          console.log('[WEBHOOK] checkout.session.completed - Session details:', {
            sessionId: session.id,
            paymentIntent: session.payment_intent || 'none',
            paymentIntentType: typeof session.payment_intent,
            customerEmail: session.customer_details?.email || session.customer_email || 'none',
            shippingName: session.shipping_details?.name || session.shipping?.name || 'none',
            shippingAddressLine1: session.shipping_details?.address?.line1 || session.shipping?.address?.line1 || 'none',
            customerDetailsAddressLine1: session.customer_details?.address?.line1 || 'none',
            hasShippingDetails: !!(session.shipping_details || session.shipping),
            hasCustomerDetails: !!session.customer_details,
            paymentStatus: session.payment_status,
            amountTotal: session.amount_total,
          });
          
          const paymentStatus = session.payment_status;
          const metadata = session.metadata || {};
          
          // Extract canonical attribution identifiers
          // Handle empty strings as null (metadata can have empty strings)
          const contestUserIdRaw = metadata.contest_user_id;
          const contestUserId = (contestUserIdRaw && typeof contestUserIdRaw === 'string' && contestUserIdRaw.trim()) ? contestUserIdRaw.trim() : null;
          
          const contestUserCodeRaw = metadata.contest_user_code || metadata.code;
          const contestUserCode = (contestUserCodeRaw && typeof contestUserCodeRaw === 'string' && contestUserCodeRaw.trim()) ? contestUserCodeRaw.trim() : null;
          
          const contestEmailRaw = metadata.contest_email;
          const contestEmail = (contestEmailRaw && typeof contestEmailRaw === 'string' && contestEmailRaw.trim()) ? contestEmailRaw.trim() : null;
          
          // Part G3: Validate product - fail loudly if missing
          const product = metadata.product || metadata.productType || null;
          if (!product || typeof product !== 'string') {
            console.error('[WEBHOOK] ❌ Missing product metadata', {
              sessionId: session.id,
              metadata: session.metadata,
              hasMetadata: !!session.metadata,
              metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
            });
            
            // Record missing product in ledger for observability
            if (prisma && buyerUserId) {
              try {
                ensureDatabaseUrl();
                await prisma.ledger.create({
                  data: {
                    sessionId: session.id,
                    userId: buyerUserId,
                    type: 'WEBHOOK_MISSING_PRODUCT',
                    points: 0,
                    amount: session.amount_total || 0,
                    currency: 'usd',
                    note: 'Missing product in Stripe metadata - webhook halted',
                    meta: {
                      sessionId: session.id,
                      metadata: session.metadata || {},
                      attemptedAt: new Date().toISOString(),
                      error: 'product_missing',
                    },
                  },
                });
                console.log('[WEBHOOK] Recorded missing product in ledger', { sessionId: session.id });
              } catch (ledgerErr) {
                console.error('[WEBHOOK] Failed to record missing product in ledger', {
                  error: ledgerErr.message,
                  sessionId: session.id,
                });
              }
            }
            
            // Stop referral + fulfillment logic - return 200 to prevent Stripe retries
            // (We've logged and recorded the issue, but don't want infinite retries)
            console.error('[WEBHOOK] ❌ Halting webhook processing - product missing', {
              sessionId: session.id,
              note: 'Purchase recorded but referral/fulfillment skipped due to missing product',
            });
            return res.status(200).json({ 
              received: true,
              error: 'product_missing',
              note: 'Webhook received but processing halted due to missing product metadata'
            });
          }
          
          const ref = metadata.ref || metadata.referrerCode || null;
          const refValid = metadata.ref_valid === 'true';
          
          // Part C1: Check for AP referral metadata (from Part B2 - auto-applied latest referral)
          const apReferralCode = metadata.ap_referral_code || null;
          const apUserId = metadata.ap_user_id || null;
          
          // Log product attribution source (now guaranteed to exist)
          console.log('[WEBHOOK] Product attribution: product=' + product + ' source=metadata.product');
          
          // Store purchase award result for email template (will be set when points are awarded)
          let purchaseAwardResultForEmail = null;
          
          // Structured attribution logging (REQUIRED)
          console.log('[ATTRIBUTION]', {
            sessionId: session.id,
            contestUserId: contestUserId || 'MISSING',
            contestUserCode: contestUserCode || 'MISSING',
            contestEmail: contestEmail || 'MISSING',
            product,
            amountTotal: session.amount_total,
            ref: ref || 'none',
            ref_valid: refValid ? 'true' : 'false',
            paymentStatus,
            datasourceUrl, // Debug: prove DATABASE_URL is set
            dbExists: fs.existsSync(dbPath), // Debug: prove db file exists
          });
          
          // Log referral metadata for debugging
          console.log('[WEBHOOK] checkout.session.completed', {
            sessionId: session.id,
            customerEmail: customerEmail || '(not provided)',
            paymentStatus,
            amountTotal: session.amount_total,
            currency: session.currency,
            product,
            referralMetadata: {
              ref: ref || 'none',
              refSource: metadata.refSource || 'none',
              refVariant: metadata.refVariant || 'none',
              referrerCode: metadata.referrerCode || ref || 'none',
              ref_valid: refValid ? 'true' : 'false',
            },
            attributionMetadata: {
              contest_user_id: contestUserId || 'MISSING',
              contest_user_code: contestUserCode || 'MISSING',
              contest_email: contestEmail || 'MISSING',
            },
            allMetadata: metadata, // Full metadata dump for debugging
          });

          // Only process if payment succeeded
          if (paymentStatus === 'paid') {
            const paymentIntentId = typeof session.payment_intent === 'string' 
              ? session.payment_intent 
              : session.payment_intent?.id || null;
            
            // ===== BUYER ATTRIBUTION & POINTS AWARD =====
            // [PRINCIPAL] Resolve canonical User principal from checkout metadata
            // Priority: contest_user_id (canonical) > contest_user_code > email (fallback)
            // NEVER use email for attribution if contest_user_id is available
            let buyerUser = null;
            let buyerAttributionMethod = 'none';
            
            // [PRINCIPAL] Log metadata availability
            console.log('[PRINCIPAL] Resolving buyer principal from webhook metadata', {
              sessionId: session.id,
              contestUserId: contestUserId || 'MISSING',
              contestUserCode: contestUserCode || 'MISSING',
              customerEmail: customerEmail || 'MISSING',
            });
            
            if (prisma) {
              // Use singleton prisma (already has explicit datasourceUrl)
              const prismaClient = prisma;
              
              // CRITICAL: Ensure DATABASE_URL is set MULTIPLE TIMES before any Prisma query
              // The adapter reads DATABASE_URL during async connect() which happens lazily
              // We must ensure it's set right before each query AND in the async context
              ensureDatabaseUrl();
              
              // Set it again immediately before the try block to ensure it's in scope
              process.env.DATABASE_URL = datasourceUrl;
              
              try {
                // PRIMARY: Use contest_user_id if available (canonical - from cookie)
                if (contestUserId) {
                  try {
                    // Safely trim contestUserId - handle non-string types
                    const trimmedUserId = typeof contestUserId === 'string' ? contestUserId.trim() : String(contestUserId || '').trim();
                    if (!trimmedUserId) {
                      console.warn('[PRINCIPAL] contestUserId is empty after trimming', { contestUserId });
                      throw new Error('contestUserId is empty');
                    }
                    // CRITICAL: Set DATABASE_URL RIGHT BEFORE the query
                    // The adapter reads it during async connect(), so we must set it synchronously
                    ensureDatabaseUrl();
                    process.env.DATABASE_URL = datasourceUrl;
                    if (typeof globalThis !== 'undefined') {
                      globalThis.DATABASE_URL = datasourceUrl;
                    }
                    buyerUser = await prismaClient.user.findUnique({
                      where: { id: trimmedUserId },
                    });
                    if (buyerUser) {
                      buyerAttributionMethod = 'contest_user_id';
                      console.log('[PRINCIPAL] Buyer principal resolved by contest_user_id', {
                        userId: buyerUser.id,
                        email: buyerUser.email || 'MISSING',
                        code: buyerUser.code || buyerUser.referralCode || 'MISSING',
                      });
                    } else {
                      console.warn('[PRINCIPAL] MISMATCH - contest_user_id provided but User not found', {
                        contestUserId: trimmedUserId,
                      });
                    }
                  } catch (err) {
                    console.warn('[PRINCIPAL] Error looking up by contest_user_id', {
                      error: err.message,
                      contestUserId,
                    });
                  }
                }
                
                // FALLBACK: Use contest_user_code if contest_user_id didn't work
                if (!buyerUser && contestUserCode) {
                  try {
                    // Safely normalize the code - handle empty strings and non-strings
                    let normalizedCode = null;
                    if (typeof contestUserCode === 'string' && contestUserCode.trim()) {
                      normalizedCode = normalizeReferralCode(contestUserCode.trim());
                    }
                    
                    if (normalizedCode) {
                      ensureDatabaseUrl(); // Ensure before query
                      buyerUser = await prismaClient.user.findUnique({
                        where: { code: normalizedCode },
                      });
                      if (buyerUser) {
                        buyerAttributionMethod = 'contest_user_code';
                        console.log('[PRINCIPAL] Buyer principal resolved by contest_user_code', {
                          userId: buyerUser.id,
                          email: buyerUser.email || 'MISSING',
                          code: buyerUser.code || buyerUser.referralCode || 'MISSING',
                        });
                      }
                    }
                  } catch (err) {
                    console.warn('[PRINCIPAL] Error looking up by contest_user_code', {
                      error: err.message,
                      stack: err.stack,
                      contestUserCode,
                      contestUserCodeType: typeof contestUserCode,
                    });
                  }
                }
                
                // LAST RESORT FALLBACK: Use email if contest_user_id and contest_user_code both failed
                // This handles cases where user purchased from catalog without contestUserId in metadata
                // BUT: only use email if we have a valid customer email from Stripe
                if (!buyerUser && customerEmail && typeof customerEmail === 'string') {
                  try {
                    const normalizedEmail = normalizeEmail(customerEmail);
                    if (normalizedEmail) {
                      ensureDatabaseUrl(); // Ensure before query
                      buyerUser = await prismaClient.user.findUnique({
                        where: { email: normalizedEmail },
                      });
                      if (buyerUser) {
                        buyerAttributionMethod = 'email_fallback';
                        console.warn('[PRINCIPAL] Buyer principal resolved by email fallback (contest_user_id missing)', {
                          userId: buyerUser.id,
                          email: buyerUser.email || 'MISSING',
                          code: buyerUser.code || buyerUser.referralCode || 'MISSING',
                          warning: 'contest_user_id should be provided in checkout metadata',
                        });
                      }
                    }
                  } catch (err) {
                    console.warn('[PRINCIPAL] Error looking up by email', {
                      error: err.message,
                      customerEmail,
                    });
                  }
                }
                
                // [PRINCIPAL] Log final resolution
                if (buyerUser) {
                  console.log('[PRINCIPAL] Buyer principal resolved', {
                    userId: buyerUser.id,
                    email: buyerUser.email || 'MISSING',
                    code: buyerUser.code || buyerUser.referralCode || 'MISSING',
                    method: buyerAttributionMethod,
                    sessionId: session.id,
                  });
                } else {
                  console.error('[PRINCIPAL] Buyer principal NOT resolved - cannot attribute purchase', {
                    sessionId: session.id,
                    contestUserId: contestUserId || 'MISSING',
                    contestUserCode: contestUserCode || 'MISSING',
                    customerEmail: customerEmail || 'MISSING',
                    message: 'No buyer user found. Points will NOT be awarded.',
                  });
                }
              } catch (attributionErr) {
                console.error('[ATTRIBUTION_BUYER] Unexpected error during attribution', {
                  error: attributionErr.message,
                  stack: attributionErr.stack,
                  sessionId: session.id,
                  contestUserId: contestUserId || 'MISSING',
                  contestUserCode: contestUserCode || 'MISSING',
                  customerEmail: customerEmail || 'MISSING',
                });
                // Try email fallback as last resort even if attribution failed
                if (!buyerUser && customerEmail && typeof customerEmail === 'string') {
                  try {
                    const normalizedEmail = normalizeEmail(customerEmail);
                    if (normalizedEmail) {
                      ensureDatabaseUrl(); // Ensure before query
                      buyerUser = await prismaClient.user.findUnique({
                        where: { email: normalizedEmail },
                      });
                      if (buyerUser) {
                        buyerAttributionMethod = 'email_fallback_recovery';
                        console.log('[ATTRIBUTION_BUYER] Recovered via email fallback after error', {
                          buyerId: buyerUser.id,
                          buyerCode: buyerUser.code || buyerUser.referralCode || 'MISSING',
                          buyerEmail: buyerUser.email || 'MISSING',
                        });
                      }
                    }
                  } catch (recoveryErr) {
                    console.error('[ATTRIBUTION_BUYER] Email fallback recovery also failed', {
                      error: recoveryErr.message,
                    });
                  }
                }
              }
            } else {
              console.warn('[ATTRIBUTION_BUYER] Prisma unavailable - cannot award points', {
                sessionId: session.id,
              });
            }
            
                // ALWAYS create Purchase row (idempotent) - even if buyer not found
                // This ensures /api/contest/score can always find the purchase
                const PURCHASE_POINTS = 500; // Points for buying any product
                
                // Declare purchase variables in outer scope so they're accessible for email sending
                let existingPurchase = null;
                let createdPurchase = null;
                
                if (prisma) {
                  try {
                    // Use singleton prisma (standard SQLite, no adapter)
                    const prismaClient = prisma;
                    
                    // CRITICAL: Ensure DATABASE_URL is set before Purchase queries
                    ensureDatabaseUrl();
                    
                    // Idempotency check: has this purchase already been recorded?
                    ensureDatabaseUrl(); // Ensure before query
                    existingPurchase = await prismaClient.purchase.findUnique({
                      where: { sessionId: session.id },
                    });
                
                if (existingPurchase) {
                  console.log('[ATTRIBUTION_BUYER] Purchase already recorded (idempotency)', {
                    sessionId: session.id,
                    buyerId: existingPurchase.userId || 'MISSING',
                    pointsAwarded: existingPurchase.pointsAwarded,
                  });
                  
                  // Case 1: Buyer was found now but wasn't before (userId was null)
                  // Also update Customer if missing
                  if (buyerUser && !existingPurchase.userId) {
                    // Upsert Customer first
                    // NOTE: Purchase model does not have customerId field - Customer is stored separately
                    let customerId = null;
                    if (finalEmail) {
                      try {
                        ensureDatabaseUrl();
                        const customerData = {
                          email: finalEmail,
                          userId: buyerUser?.id || null, // Attach to canonical User principal
                          name: finalName || null,
                          phone: finalPhone || null,
                          shippingStreet: finalAddress?.line1 || null,
                          shippingCity: finalAddress?.city || null,
                          shippingState: finalAddress?.state || null,
                          shippingZip: finalAddress?.postal_code || null,
                          shippingCountry: finalAddress?.country || null,
                        };
                        const customer = await prismaClient.customer.upsert({
                          where: { email: finalEmail },
                          update: {
                            ...customerData,
                            userId: buyerUser?.id || undefined, // Update userId if buyerUser available
                          },
                          create: customerData,
                        });
                        customerId = customer.id;
                        console.log('[PRINCIPAL] Customer linked to User', {
                          customerId: customer.id,
                          userId: customer.userId || 'none',
                          email: customer.email,
                        });
                      } catch (customerErr) {
                        console.warn('[CUSTOMER] Failed to upsert customer during retroactive update', {
                          error: customerErr.message,
                        });
                      }
                    }
                    
                    ensureDatabaseUrl(); // Ensure before transaction
                    
                    // Award purchase points (Math Mode - deterministic, no caps)
                    const purchaseAwardResult = await awardPurchaseDailyPoints(prismaClient, {
                      userId: buyerUser.id,
                      sessionId: session.id, // Required for idempotency
                    });
                    
                    // Store for email template
                    purchaseAwardResultForEmail = purchaseAwardResult;
                    
                    await prismaClient.purchase.update({
                      where: { sessionId: session.id },
                      data: {
                        userId: buyerUser.id,
                        amount: session.amount_total || null,
                        currency: session.currency || null,
                        source: 'stripe',
                      },
                    });
                    
                    console.log('[PURCHASE] Purchase points award result (retroactive update)', {
                      userId: buyerUser.id,
                      awarded: purchaseAwardResult.awarded,
                      reason: purchaseAwardResult.reason,
                    });
                    
                    // NOTE: Fulfillment model does not exist in schema
                    // Fulfillment information is stored in Order model (status, labelPrintedAt, shippedAt, etc.)
                    // Order is linked to Purchase via stripeSessionId
                    
                    console.log('[ATTRIBUTION_BUYER] Updated Purchase with buyer and awarded points', {
                      buyerId: buyerUser.id,
                      customerId: customerId || 'none',
                      pointsAwarded: PURCHASE_POINTS,
                    });
                    
                    // ===== CUSTOMER/FULFILLMENT PERSISTENCE (EXISTING PURCHASE PATH) =====
                    // Extract shipping/contact from session object
                    const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
                    const cust = session.customer_details ?? null;
                    const email = cust?.email ?? session.customer_email ?? session.metadata?.contest_email ?? null;
                    const name = ship?.name ?? cust?.name ?? null;
                    const phone = cust?.phone ?? null;
                    
                    // Only extract shipping address for physical products (paperback)
                    // For ebooks/audio_preorder, don't use customer_details.address as shipping
                    const isPhysicalProduct = product === 'paperback';
                    const addr = isPhysicalProduct 
                      ? (ship?.address ?? null)  // Only use shipping_details.address for physical products
                      : null;  // No shipping for ebooks/audio
                    
                    if (email && existingPurchase.id) {
                      try {
                        // Upsert Customer by email
                        const customerData = {
                          email: email,
                          name: name ?? null,
                          phone: phone ?? null,
                          shippingStreet: addr?.line1 ?? null,
                          shippingCity: addr?.city ?? null,
                          shippingState: addr?.state ?? null,
                          shippingZip: addr?.postal_code ?? null,
                          shippingCountry: addr?.country ?? null,
                        };
                        
                        ensureDatabaseUrl();
                        const customer = await prismaClient.customer.upsert({
                          where: { email: email },
                          update: customerData,
                          create: customerData,
                        });
                        
                        console.log('[CUSTOMER] ✅ upserted', {
                          email: customer.email,
                          customerId: customer.id,
                          shippingStreet: customer.shippingStreet || 'none',
                        });
                        
                        // NOTE: Purchase model does not have customerId or paymentIntentId fields
                        // Customer and Fulfillment are stored separately (Customer model, Order model)
                        // Purchase only stores: sessionId, amount, currency, source, userId
                        
                        // NOTE: Fulfillment model does not exist in schema
                        // Fulfillment information is stored in Order model (status, labelPrintedAt, shippedAt, etc.)
                        // Order is linked to Purchase via stripeSessionId
                      } catch (customerFulfillmentErr) {
                        console.error('[CUSTOMER/FULFILLMENT] ❌ Failed to persist customer/fulfillment', {
                          error: customerFulfillmentErr.message,
                          stack: customerFulfillmentErr.stack,
                          purchaseId: existingPurchase.id,
                          email: email,
                        });
                        // Don't fail webhook - customer/fulfillment is non-critical for purchase flow
                      }
                    }
                  }
                  
                  // Case 2: Purchase exists with userId but pointsAwarded is 0 (points were missed due to error)
                  // This handles retroactive point awards for purchases that failed due to .replace() error
                  if (existingPurchase.userId && existingPurchase.pointsAwarded === 0) {
                    // Try to find the buyer user
                    let retroBuyer = buyerUser;
                    if (!retroBuyer && existingPurchase.userId) {
                      try {
                        ensureDatabaseUrl(); // Ensure before query
                        retroBuyer = await prismaClient.user.findUnique({
                          where: { id: existingPurchase.userId },
                        });
                      } catch (retroErr) {
                        console.warn('[ATTRIBUTION_BUYER] Failed to find buyer for retroactive points', {
                          error: retroErr.message,
                          userId: existingPurchase.userId,
                        });
                      }
                    }
                    
                    if (retroBuyer) {
                      // Award purchase points (Math Mode - deterministic, no caps)
                      const purchaseAwardResult = await awardPurchaseDailyPoints(prismaClient, {
                        userId: retroBuyer.id,
                        sessionId: session.id, // Required for idempotency
                      });
                      
                      await prismaClient.purchase.update({
                        where: { sessionId: session.id },
                        data: {
                          // Purchase model doesn't have pointsAwarded field - points are tracked in Ledger
                          // Just update amount/currency if needed
                          amount: session.amount_total || existingPurchase.amount,
                          currency: session.currency || existingPurchase.currency,
                        },
                      });
                      
                      console.log('[ATTRIBUTION_BUYER] Retroactively awarded points for existing purchase', {
                        buyerId: retroBuyer.id,
                        buyerEmail: retroBuyer.email || 'MISSING',
                        pointsAwarded: purchaseAwardResult.awarded,
                        reason: purchaseAwardResult.reason,
                        sessionId: session.id,
                      });
                    }
                  }
                  
                  // Case 3: Purchase exists but userId is null (buyer lookup failed)
                  // Try to retroactively attribute by email if we have customerEmail
                  if (!existingPurchase.userId && customerEmail && !buyerUser) {
                    try {
                      const normalizedEmail = normalizeEmail(customerEmail);
                      if (normalizedEmail) {
                        ensureDatabaseUrl(); // Ensure before query
                        const retroBuyerByEmail = await prismaClient.user.findUnique({
                          where: { email: normalizedEmail },
                        });
                        
                        if (retroBuyerByEmail) {
                          ensureDatabaseUrl(); // Ensure before transaction
                          // Award purchase points (Math Mode - deterministic, no caps)
                          const purchaseAwardResult = await awardPurchaseDailyPoints(prismaClient, {
                            userId: retroBuyerByEmail.id,
                            sessionId: session.id, // Required for idempotency
                          });
                          
                          await prismaClient.purchase.update({
                            where: { sessionId: session.id },
                            data: {
                              userId: retroBuyerByEmail.id,
                              amount: session.amount_total || existingPurchase.amount,
                              currency: session.currency || existingPurchase.currency,
                              source: 'stripe',
                            },
                          });
                          
                          console.log('[ATTRIBUTION_BUYER] Retroactively attributed purchase by email and awarded points', {
                            buyerId: retroBuyerByEmail.id,
                            buyerEmail: retroBuyerByEmail.email || 'MISSING',
                            pointsAwarded: purchaseAwardResult.awarded,
                            reason: purchaseAwardResult.reason,
                            sessionId: session.id,
                          });
                          // Update buyerUser so email can use it
                          buyerUser = retroBuyerByEmail;
                        }
                      }
                    } catch (retroEmailErr) {
                      console.warn('[ATTRIBUTION_BUYER] Failed to retroactively attribute by email', {
                        error: retroEmailErr.message,
                        customerEmail,
                      });
                    }
                  }
                } else {
                  // ===== CREATE/UPSERT CUSTOMER =====
                  let customerId = null;
                  if (finalEmail) {
                    try {
                      ensureDatabaseUrl(); // Ensure before query
                      const customerData = {
                        email: finalEmail,
                        name: finalName || null,
                        phone: finalPhone || null,
                        shippingStreet: finalAddress?.line1 || null,
                        shippingCity: finalAddress?.city || null,
                        shippingState: finalAddress?.state || null,
                        shippingZip: finalAddress?.postal_code || null,
                        shippingCountry: finalAddress?.country || null,
                      };
                      
                      // Upsert Customer by email and attach to User principal
                      const customer = await prismaClient.customer.upsert({
                        where: { email: finalEmail },
                        update: {
                          // Update existing customer with latest shipping info and userId
                          userId: buyerUser?.id || undefined, // Attach to canonical User principal
                          name: customerData.name || undefined,
                          phone: customerData.phone || undefined,
                          shippingStreet: customerData.shippingStreet || undefined,
                          shippingCity: customerData.shippingCity || undefined,
                          shippingState: customerData.shippingState || undefined,
                          shippingZip: customerData.shippingZip || undefined,
                          shippingCountry: customerData.shippingCountry || undefined,
                        },
                        create: {
                          ...customerData,
                          userId: buyerUser?.id || null, // Attach to canonical User principal
                        },
                      });
                      
                      customerId = customer.id;
                      // ===== STEP 4: LOG SUCCESS =====
                      console.log('[PRINCIPAL] Customer linked to User', {
                        customerId: customer.id,
                        userId: customer.userId || 'none',
                        email: customer.email,
                        hasShipping: !!(customerData.shippingStreet || customerData.shippingCity),
                      });
                    } catch (customerErr) {
                      // ===== STEP 3: FAIL LOUDLY =====
                      console.error('[CUSTOMER] ❌ CUSTOMER WRITE FAILED', {
                        error: customerErr.message,
                        stack: customerErr.stack,
                        email: finalEmail,
                        customerData: {
                          email: finalEmail,
                          name: finalName || null,
                          phone: finalPhone || null,
                          shippingStreet: finalAddress?.line1 || null,
                        },
                      });
                      // Return 500 so Stripe retries and we see the failure
                      return res.status(500).json({ 
                        error: 'Customer upsert failed',
                        details: customerErr.message 
                      });
                    }
                  }
                  
                  // ===== CREATE PURCHASE RECORD =====
                  // createdPurchase already declared in outer scope
                  try {
                    console.log('[WEBHOOK] DB: upsert order START');
                    if (buyerUser) {
                      // Check if Purchase already exists (idempotency - webhook retries)
                      ensureDatabaseUrl(); // Ensure before query
                      const existingPurchaseCheck = await prismaClient.purchase.findUnique({
                        where: { sessionId: session.id },
                      });
                      
                      if (existingPurchaseCheck) {
                        console.log('[PURCHASE] Purchase already exists (idempotency)', {
                          sessionId: session.id,
                          purchaseId: existingPurchaseCheck.id,
                          buyerId: existingPurchaseCheck.userId || 'MISSING',
                        });
                        createdPurchase = existingPurchaseCheck;
                        existingPurchase = existingPurchaseCheck;
                        
                        // Still try to award points (idempotent - will skip if already awarded)
                        console.log('[WEBHOOK] Points: awardPurchase START userId=' + buyerUser.id + ' sessionId=' + session.id);
                        const purchaseAwardResult = await awardPurchaseDailyPoints(prismaClient, {
                          userId: buyerUser.id,
                          sessionId: session.id, // Required for idempotency
                        });
                        purchaseAwardResultForEmail = purchaseAwardResult;
                        console.log('[WEBHOOK] Points: awardPurchase OK delta=' + purchaseAwardResult.awarded + ' total=' + (buyerUser.points + purchaseAwardResult.awarded) + ' reason=' + (purchaseAwardResult.reason || 'none'));
                      } else {
                        // Buyer found: create Purchase + award points + fulfillment
                        console.log('[PURCHASE] Creating Purchase with buyer', {
                          sessionId: session.id,
                          buyerId: buyerUser.id,
                          customerId: customerId || 'none',
                          paymentIntentId: paymentIntentId || 'none',
                        });
                        
                        ensureDatabaseUrl(); // Ensure before transaction
                        
                        // Award purchase points (Math Mode - deterministic, no caps)
                        console.log('[WEBHOOK] Points: awardPurchase START userId=' + buyerUser.id + ' sessionId=' + session.id);
                        const purchaseAwardResult = await awardPurchaseDailyPoints(prismaClient, {
                          userId: buyerUser.id,
                          sessionId: session.id, // Required for idempotency
                        });
                        
                        // Store for email template
                        purchaseAwardResultForEmail = purchaseAwardResult;
                        
                        console.log('[WEBHOOK] Points: awardPurchase OK delta=' + purchaseAwardResult.awarded + ' total=' + (buyerUser.points + purchaseAwardResult.awarded) + ' reason=' + (purchaseAwardResult.reason || 'none'));
                        
                        const purchaseData = {
                          sessionId: session.id,
                          userId: buyerUser.id,
                          amount: session.amount_total || null,
                          currency: session.currency || null,
                          source: 'stripe',
                        };
                        
                        // Use upsert for idempotency (handles webhook retries gracefully)
                        createdPurchase = await prismaClient.purchase.upsert({
                          where: { sessionId: session.id },
                          update: {
                            // Update if exists (shouldn't happen, but handle gracefully)
                            userId: buyerUser.id,
                            amount: session.amount_total || null,
                            currency: session.currency || null,
                          },
                          create: purchaseData,
                        });
                        
                        // Note: Points already awarded by helper function
                        console.log('[PURCHASE] Purchase points award result', {
                          userId: buyerUser.id,
                          awarded: purchaseAwardResult.awarded,
                          reason: purchaseAwardResult.reason,
                        });
                      }
                      
                      // ===== LEDGER: Record Purchase Transaction =====
                      try {
                        await recordLedgerEntry(prismaClient, {
                          sessionId: session.id,
                          userId: buyerUser.id,
                          type: 'PURCHASE_RECORDED',
                          amount: session.amount_total || 0,
                          currency: session.currency || 'usd',
                          note: `Purchase recorded: ${product}`,
                          meta: {
                            product,
                            paymentStatus,
                            email: customerEmail || buyerUser.email,
                            stripePaymentIntentId: paymentIntentId,
                            purchaseId: createdPurchase.id,
                          },
                        });
                      } catch (ledgerErr) {
                        console.error('[LEDGER] Failed to record PURCHASE_RECORDED', {
                          error: ledgerErr.message,
                          code: ledgerErr.code,
                          sessionId: session.id,
                          userId: buyerUser.id,
                          stack: ledgerErr.stack,
                        });
                        // Don't fail webhook - ledger is for auditability
                      }
                      
                      // ===== LEDGER: Record Points Awarded/Skipped =====
                      // Ensure purchaseAwardResult is always defined (fallback if somehow missing)
                      const purchaseAwardResult = purchaseAwardResultForEmail || { awarded: 0, reason: 'not_awarded' };
                      try {
                        if (purchaseAwardResult.awarded > 0) {
                          await recordLedgerEntry(prismaClient, {
                            sessionId: session.id,
                            userId: buyerUser.id,
                            type: 'POINTS_AWARDED_PURCHASE',
                            points: purchaseAwardResult.awarded,
                            amount: purchaseAwardResult.awarded,
                            currency: 'points',
                            note: `Points awarded for purchase`,
                            meta: {
                              reason: purchaseAwardResult.reason || 'awarded',
                              purchaseId: createdPurchase.id,
                            },
                          });
                        } else {
                          await recordLedgerEntry(prismaClient, {
                            sessionId: session.id,
                            userId: buyerUser.id,
                            type: 'POINTS_SKIPPED_PURCHASE',
                            points: 0,
                            amount: 0,
                            currency: 'points',
                            note: `Points skipped: ${purchaseAwardResult.reason || 'unknown'}`,
                            meta: {
                              reason: purchaseAwardResult.reason || 'unknown',
                              purchaseId: createdPurchase.id,
                            },
                          });
                        }
                      } catch (ledgerErr) {
                        console.error('[LEDGER] Failed to record POINTS ledger entry', {
                          error: ledgerErr.message,
                          sessionId: session.id,
                          userId: buyerUser.id,
                        });
                        // Don't fail webhook - ledger is for auditability
                      }
                      
                      // ===== LEDGER: Ensure implicit CONTEST_JOIN exists (idempotent) =====
                      // After purchase, user is implicitly in contest - create CONTEST_JOIN if missing
                      try {
                        const { hasContestJoin } = require('../lib/contest/hasContestJoin.cjs');
                        const alreadyJoined = await hasContestJoin(prismaClient, buyerUser.id);
                        
                        if (!alreadyJoined) {
                          const CONTEST_JOIN_SESSION_ID = 'contest_join';
                          await recordLedgerEntry(prismaClient, {
                            sessionId: CONTEST_JOIN_SESSION_ID,
                            userId: buyerUser.id,
                            type: 'CONTEST_JOIN',
                            points: 500,
                            amount: 500,
                            currency: 'points',
                            note: 'Implicit contest entry via purchase',
                            meta: {
                              entryMethod: 'purchase',
                              purchaseId: createdPurchase.id,
                              entryAt: new Date().toISOString(),
                            },
                          });
                          console.log('[WEBHOOK] Created implicit CONTEST_JOIN', {
                            userId: buyerUser.id,
                            purchaseId: createdPurchase.id,
                            sessionId: session.id,
                          });
                        } else {
                          console.log('[WEBHOOK] User already has CONTEST_JOIN (skipping implicit entry)', {
                            userId: buyerUser.id,
                            purchaseId: createdPurchase.id,
                          });
                        }
                      } catch (contestJoinErr) {
                        // Handle unique constraint violation (race condition)
                        if (contestJoinErr.code === 'P2002' || contestJoinErr.message?.includes('Unique constraint')) {
                          console.log('[WEBHOOK] CONTEST_JOIN already exists (race condition)', {
                            userId: buyerUser.id,
                            purchaseId: createdPurchase.id,
                          });
                        } else {
                          console.error('[WEBHOOK] Failed to create implicit CONTEST_JOIN', {
                            error: contestJoinErr.message,
                            sessionId: session.id,
                            userId: buyerUser.id,
                          });
                          // Don't fail webhook - implicit entry is non-critical
                        }
                      }
                      
                      // ===== STEP 4: LOG SUCCESS =====
                      console.log('[WEBHOOK] DB: upsert order OK orderId=' + createdPurchase.id);
                      console.log('[PURCHASE] ✅ Purchase created + points awarded', {
                        purchaseId: createdPurchase.id,
                        buyerId: buyerUser.id,
                        buyerCode: buyerUser.code || buyerUser.referralCode || 'MISSING',
                        buyerEmail: buyerUser.email || 'MISSING',
                        customerId: customerId || 'none',
                        paymentIntentId: paymentIntentId || 'none',
                        pointsAwarded: PURCHASE_POINTS,
                        method: buyerAttributionMethod,
                      });
                      
                      // ===== CUSTOMER/FULFILLMENT PERSISTENCE (ATTRIBUTION FLOW) =====
                      // Extract shipping/contact from session object
                      const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
                      const cust = session.customer_details ?? null;
                      const email = cust?.email ?? session.customer_email ?? session.metadata?.contest_email ?? null;
                      const name = ship?.name ?? cust?.name ?? null;
                      const phone = cust?.phone ?? null;
                      
                      // Only extract shipping address for physical products (paperback)
                      // For ebooks/audio_preorder, don't use customer_details.address as shipping
                      const isPhysicalProduct = product === 'paperback';
                      const addr = isPhysicalProduct 
                        ? (ship?.address ?? null)  // Only use shipping_details.address for physical products
                        : null;  // No shipping for ebooks/audio
                      
                      if (email) {
                        try {
                          // Upsert Customer by email
                          const customerData = {
                            email: email,
                            userId: buyerUser?.id || null, // Attach to canonical User principal
                            name: name ?? null,
                            phone: phone ?? null,
                            shippingStreet: addr?.line1 ?? null,
                            shippingCity: addr?.city ?? null,
                            shippingState: addr?.state ?? null,
                            shippingZip: addr?.postal_code ?? null,
                            shippingCountry: addr?.country ?? null,
                          };
                          
                          ensureDatabaseUrl();
                          const customer = await prismaClient.customer.upsert({
                            where: { email: email },
                            update: {
                              ...customerData,
                              userId: buyerUser?.id || undefined, // Update userId if buyerUser available
                            },
                            create: customerData,
                          });
                          
                          console.log('[PRINCIPAL] Customer linked to User', {
                            email: customer.email,
                            customerId: customer.id,
                            userId: customer.userId || 'none',
                            shippingStreet: customer.shippingStreet || 'none',
                          });
                          
                          // NOTE: Purchase model does not have customerId or paymentIntentId fields
                          // Customer and Fulfillment are stored separately (Customer model, Order model)
                          // Purchase only stores: sessionId, amount, currency, source, userId
                          
                          // NOTE: Fulfillment model does not exist in schema
                          // Fulfillment information is stored in Order model (status, labelPrintedAt, shippedAt, etc.)
                          // Order is linked to Purchase via stripeSessionId
                        } catch (customerFulfillmentErr) {
                          console.error('[CUSTOMER/FULFILLMENT] ❌ Failed to persist customer/fulfillment', {
                            error: customerFulfillmentErr.message,
                            stack: customerFulfillmentErr.stack,
                            purchaseId: createdPurchase.id,
                            email: email,
                          });
                          // Don't fail webhook - customer/fulfillment is non-critical for purchase flow
                        }
                      } else {
                        console.warn('[CUSTOMER/FULFILLMENT] ⚠️  No email available for Customer creation', {
                          purchaseId: createdPurchase.id,
                          sessionId: session.id,
                        });
                      }
                    } else {
                      // Buyer not found: cannot create Purchase (userId is required)
                      console.error('[WEBHOOK] DB FAILED: Cannot create Purchase - buyer not found', {
                        sessionId: session.id,
                        contestUserId: contestUserId || 'MISSING',
                        contestUserCode: contestUserCode || 'MISSING',
                        customerEmail: customerEmail || 'MISSING',
                      });
                      // Return 500 so Stripe retries - buyer attribution may succeed on retry
                      return res.status(500).json({ 
                        error: 'Purchase creation failed - buyer attribution required',
                        details: 'No buyer found for session. Points and email will not be sent until buyer is attributed.'
                      });
                      
                      // ===== STEP 4: LOG SUCCESS =====
                      console.log('[WEBHOOK] DB: upsert order OK orderId=' + createdPurchase.id + ' (no buyer)');
                      console.log('[PURCHASE] ✅ Purchase created WITHOUT buyer attribution', {
                        purchaseId: createdPurchase.id,
                        sessionId: session.id,
                        contestUserId: contestUserId || 'MISSING',
                        contestUserCode: contestUserCode || 'MISSING',
                        customerEmail: customerEmail || 'MISSING',
                        customerId: customerId || 'none',
                        paymentIntentId: paymentIntentId || 'none',
                        note: 'Purchase row exists but pointsAwarded=0. Buyer lookup failed.',
                      });
                      
                      // ===== LEDGER: Record Purchase Transaction (no buyer) =====
                      // Note: Can't record ledger entry without userId, but we can log it
                      console.warn('[LEDGER] Purchase recorded but no buyer - skipping ledger entry', {
                        sessionId: session.id,
                        purchaseId: createdPurchase.id,
                        customerEmail: customerEmail || 'MISSING',
                      });
                      
                      // ===== CUSTOMER/FULFILLMENT PERSISTENCE (ATTRIBUTION FLOW - NO BUYER) =====
                      // Extract shipping/contact from session object
                      const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
                      const cust = session.customer_details ?? null;
                      const email = cust?.email ?? session.customer_email ?? session.metadata?.contest_email ?? null;
                      const name = ship?.name ?? cust?.name ?? null;
                      const phone = cust?.phone ?? null;
                      
                      // Only extract shipping address for physical products (paperback)
                      // For ebooks/audio_preorder, don't use customer_details.address as shipping
                      const isPhysicalProduct = product === 'paperback';
                      const addr = isPhysicalProduct 
                        ? (ship?.address ?? null)  // Only use shipping_details.address for physical products
                        : null;  // No shipping for ebooks/audio
                      
                      if (email) {
                        try {
                          // Upsert Customer by email
                          const customerData = {
                            email: email,
                            userId: buyerUser?.id || null, // Attach to canonical User principal
                            name: name ?? null,
                            phone: phone ?? null,
                            shippingStreet: addr?.line1 ?? null,
                            shippingCity: addr?.city ?? null,
                            shippingState: addr?.state ?? null,
                            shippingZip: addr?.postal_code ?? null,
                            shippingCountry: addr?.country ?? null,
                          };
                          
                          ensureDatabaseUrl();
                          const customer = await prismaClient.customer.upsert({
                            where: { email: email },
                            update: {
                              ...customerData,
                              userId: buyerUser?.id || undefined, // Update userId if buyerUser available
                            },
                            create: customerData,
                          });
                          
                          console.log('[PRINCIPAL] Customer linked to User', {
                            email: customer.email,
                            customerId: customer.id,
                            userId: customer.userId || 'none',
                            shippingStreet: customer.shippingStreet || 'none',
                          });
                          
                          // NOTE: Purchase model does not have customerId or paymentIntentId fields
                          // Customer and Fulfillment are stored separately (Customer model, Order model)
                          // Purchase only stores: sessionId, amount, currency, source, userId
                          
                          // NOTE: Fulfillment model does not exist in schema
                          // Fulfillment information is stored in Order model (status, labelPrintedAt, shippedAt, etc.)
                          // Order is linked to Purchase via stripeSessionId
                        } catch (customerFulfillmentErr) {
                          console.error('[CUSTOMER/FULFILLMENT] ❌ Failed to persist customer/fulfillment', {
                            error: customerFulfillmentErr.message,
                            stack: customerFulfillmentErr.stack,
                            purchaseId: createdPurchase.id,
                            email: email,
                          });
                          // Don't fail webhook - customer/fulfillment is non-critical for purchase flow
                        }
                      } else {
                        console.warn('[CUSTOMER/FULFILLMENT] ⚠️  No email available for Customer creation', {
                          purchaseId: createdPurchase.id,
                          sessionId: session.id,
                        });
                      }
                    }
                    
                    // ===== LEDGER: Record Fulfillment Obligations =====
                    if (createdPurchase && buyerUser) {
                      try {
                        // Re-extract shipping address for fulfillment ledger (addr may be out of scope)
                        const shipForLedger = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
                        const isPhysicalProductForLedger = product === 'paperback';
                        const addrForLedger = isPhysicalProductForLedger ? (shipForLedger?.address ?? null) : null;
                        const nameForLedger = shipForLedger?.name ?? session.customer_details?.name ?? null;
                        
                        // Always record what we owe the buyer based on product
                        if (product === 'paperback') {
                          // Paperback purchase: record shipment obligation
                          await recordLedgerEntry(prismaClient, {
                            sessionId: session.id,
                            userId: buyerUser.id,
                            type: 'FULFILLMENT_PAPERBACK_SHIP',
                            amount: null,
                            currency: null,
                            note: 'Paperback shipment owed',
                            meta: {
                              productOwed: 'paperback',
                              status: 'queued',
                              shippingRequired: true,
                              address: addrForLedger ? {
                                line1: addrForLedger.line1,
                                city: addrForLedger.city,
                                state: addrForLedger.state,
                                postal_code: addrForLedger.postal_code,
                                country: addrForLedger.country,
                              } : null,
                              name: nameForLedger || null,
                              email: customerEmail || buyerUser.email || null,
                              purchaseId: createdPurchase.id,
                            },
                          });
                          
                          // Paperback purchases also get free eBook grant
                          await recordLedgerEntry(prismaClient, {
                            sessionId: session.id,
                            userId: buyerUser.id,
                            type: 'FULFILLMENT_EBOOK_GRANT',
                            amount: null,
                            currency: null,
                            note: 'eBook download granted (free with paperback)',
                            meta: {
                              productOwed: 'ebook',
                              status: 'queued',
                              shippingRequired: false,
                              purchaseId: createdPurchase.id,
                            },
                          });
                        } else if (product === 'ebook') {
                          // eBook purchase: record download grant
                          await recordLedgerEntry(prismaClient, {
                            sessionId: session.id,
                            userId: buyerUser.id,
                            type: 'FULFILLMENT_EBOOK_GRANT',
                            amount: null,
                            currency: null,
                            note: 'eBook download granted',
                            meta: {
                              productOwed: 'ebook',
                              status: 'queued',
                              shippingRequired: false,
                              purchaseId: createdPurchase.id,
                            },
                          });
                        } else if (product === 'audio_preorder') {
                          // Audio preorder: record fulfillment obligation
                          await recordLedgerEntry(prismaClient, {
                            sessionId: session.id,
                            userId: buyerUser.id,
                            type: 'FULFILLMENT_AUDIO_PREORDER',
                            amount: null,
                            currency: null,
                            note: 'Audio preorder fulfillment',
                            meta: {
                              productOwed: 'audio_preorder',
                              status: 'queued',
                              shippingRequired: false,
                              purchaseId: createdPurchase.id,
                            },
                          });
                        }
                      } catch (fulfillmentLedgerErr) {
                        console.error('[LEDGER] Failed to record fulfillment ledger entries', {
                          error: fulfillmentLedgerErr.message,
                          sessionId: session.id,
                          userId: buyerUser.id,
                          product,
                        });
                        // Don't fail webhook - ledger is for auditability
                      }
                    }
                    
                    // NOTE: Fulfillment model does not exist in schema
                    // Fulfillment information is stored in Order model (status, labelPrintedAt, shippedAt, etc.)
                    // Order is linked to Purchase via stripeSessionId
                    // This section removed to prevent Prisma errors
                  } catch (purchaseErr) {
                    // ===== STEP 3: FAIL LOUDLY =====
                    console.error('[WEBHOOK] checkout.session.completed ERROR', purchaseErr?.stack || purchaseErr);
                    console.error('[WEBHOOK] DB FAILED: Purchase creation failed - skipping points/email', {
                      error: purchaseErr.message,
                      stack: purchaseErr.stack,
                      sessionId: session.id,
                      customerId: customerId || 'none',
                      buyerId: buyerUser?.id || 'MISSING',
                    });
                    // Return 500 so Stripe retries - Purchase creation is critical
                    return res.status(500).json({ 
                      error: 'Purchase creation failed',
                      details: purchaseErr.message 
                    });
                  }
                }
              } catch (pointsErr) {
                console.error('[WEBHOOK] checkout.session.completed ERROR', pointsErr?.stack || pointsErr);
                console.error('[WEBHOOK] DB FAILED: Purchase record creation failed', {
                  error: pointsErr.message,
                  sessionId: session.id,
                  buyerId: buyerUser?.id || 'MISSING',
                  stack: pointsErr.stack,
                });
                // Return 500 so Stripe retries - Purchase creation is critical
                return res.status(500).json({ 
                  error: 'Purchase creation failed',
                  details: pointsErr.message 
                });
              }
            } else {
              console.error('[ATTRIBUTION_BUYER] Prisma not available - cannot create Purchase record', {
                sessionId: session.id,
              });
            }

            // Free eBook fulfillment: If customer bought paperback, grant eBook
            if (product === 'paperback') {
              try {
                if (!customerEmail) {
                  // Log fulfillment but mark as failed due to missing email
                  logFulfillment({
                    type: 'EBOOK_GRANT',
                    email: 'unknown@missing.email',
                    sessionId: session.id,
                    paymentIntentId,
                    productPurchased: 'paperback',
                    grantProduct: 'ebook',
                    ref: metadata.ref || null,
                    src: metadata.src || null,
                    v: metadata.v || null,
                    origin: metadata.origin || null,
                    status: 'failed',
                    error: 'missing_email',
                  });
                  console.warn('[WEBHOOK] eBook fulfillment logged but failed - missing customer email', {
                    sessionId: session.id,
                  });
                } else {
                  // Log fulfillment with email (status: queued)
                  logFulfillment({
                    type: 'EBOOK_GRANT',
                    email: customerEmail,
                    sessionId: session.id,
                    paymentIntentId,
                    productPurchased: 'paperback',
                    grantProduct: 'ebook',
                    ref: metadata.ref || null,
                    src: metadata.src || null,
                    v: metadata.v || null,
                    origin: metadata.origin || null,
                    status: 'queued',
                  });
                  console.log('[WEBHOOK] eBook fulfillment queued for paperback purchase', {
                    sessionId: session.id,
                    email: customerEmail,
                  });
                }
              } catch (fulfillmentErr) {
                console.error('[WEBHOOK] Failed to log eBook fulfillment', {
                  error: fulfillmentErr.message,
                  sessionId: session.id,
                  email: customerEmail || '(not provided)',
                });
                // Don't fail the webhook - fulfillment logging is non-critical
              }
            }

            // Part C1: Process referral commission
            // Priority: metadata.ap_referral_code > metadata.ref (if valid) > buyer's lastReferral (if active)
            let referralCodeToUse = null;
            let referralSource = 'none';
            
            if (apReferralCode && apUserId && paymentStatus === 'paid') {
              // Priority 1: AP referral metadata (from auto-applied latest referral)
              referralCodeToUse = apReferralCode;
              referralSource = 'ap_metadata';
              console.log('[ATTRIBUTION_REFERRER] Using AP referral from metadata', {
                apReferralCode,
                apUserId,
                sessionId: session.id,
              });
            } else if (ref && refValid && paymentStatus === 'paid') {
              // Priority 2: Explicit ref param (user-entered or stored)
              referralCodeToUse = ref;
              referralSource = 'metadata_ref';
              console.log('[ATTRIBUTION_REFERRER] Using ref from metadata', {
                ref,
                sessionId: session.id,
              });
            } else if (buyerUser && paymentStatus === 'paid' && prisma) {
              // Priority 3: Check buyer's lastReferral (if within attribution window)
              try {
                ensureDatabaseUrl();
                const buyerWithReferral = await prisma.user.findUnique({
                  where: { id: buyerUser.id },
                  select: {
                    lastReferralCode: true,
                    lastReferralAt: true,
                    lastReferredByUserId: true,
                    lastReferralSource: true,
                  },
                });
                
                if (buyerWithReferral?.lastReferralCode && buyerWithReferral?.lastReferralAt) {
                  const REFERRAL_ATTRIBUTION_WINDOW_DAYS = 30;
                  const REFERRAL_ATTRIBUTION_WINDOW_MS = REFERRAL_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
                  const referralAgeMs = Date.now() - new Date(buyerWithReferral.lastReferralAt).getTime();
                  
                  if (referralAgeMs <= REFERRAL_ATTRIBUTION_WINDOW_MS) {
                    referralCodeToUse = buyerWithReferral.lastReferralCode;
                    referralSource = 'buyer_last_referral';
                    console.log('[ATTRIBUTION_REFERRER] Using buyer lastReferral', {
                      referralCode: referralCodeToUse,
                      ageDays: Math.floor(referralAgeMs / (24 * 60 * 60 * 1000)),
                      source: buyerWithReferral.lastReferralSource,
                      sessionId: session.id,
                    });
                  } else {
                    console.log('[ATTRIBUTION_REFERRER] Buyer lastReferral expired', {
                      referralCode: buyerWithReferral.lastReferralCode,
                      ageDays: Math.floor(referralAgeMs / (24 * 60 * 60 * 1000)),
                      windowDays: REFERRAL_ATTRIBUTION_WINDOW_DAYS,
                      sessionId: session.id,
                    });
                  }
                }
              } catch (lastRefErr) {
                console.warn('[ATTRIBUTION_REFERRER] Failed to check buyer lastReferral', {
                  error: lastRefErr.message,
                  sessionId: session.id,
                });
              }
            }
            
            if (referralCodeToUse && paymentStatus === 'paid') {
              try {
                await processReferralCommission({
                  referrerCode: referralCodeToUse.toUpperCase(),
                  buyerEmail: customerEmail,
                  buyerUserId: buyerUser?.id || null,
                  sessionId: session.id,
                  product: product,
                  amountTotal: session.amount_total || 0,
                  session: session, // Pass full session object for discount calculation
                  metadata,
                  purchaseId: createdPurchase?.id || existingPurchase?.id || null,
                  purchaseDay: new Date(session.created * 1000),
                });
              } catch (refErr) {
                console.error('[WEBHOOK] Failed to process referral commission', {
                  error: refErr.message,
                  sessionId: session.id,
                  referrerCode: referralCodeToUse,
                  referralSource,
                });
                // Don't fail webhook - referral commission is non-critical
              }
            } else if (ref && !refValid) {
              console.log('[ATTRIBUTION_REFERRER] Skipping - ref_valid is false', {
                ref,
                ref_valid: refValid,
                sessionId: session.id,
              });
              
              // ===== LEDGER: Record Referral Skipped =====
              // Use prisma singleton directly (prismaClient is scoped inside if(prisma) block)
              if (buyerUser && prisma) {
                try {
                  ensureDatabaseUrl(); // Ensure DATABASE_URL is set
                  await recordLedgerEntry(prisma, {
                    sessionId: session.id,
                    userId: buyerUser.id,
                    type: 'REFERRAL_SKIPPED',
                    amount: 0,
                    currency: 'usd',
                    note: `Referral skipped: ref_valid is false`,
                    meta: {
                      reason: 'ref_valid_false',
                      referrerCode: ref,
                      purchaseId: createdPurchase?.id || existingPurchase?.id || null,
                    },
                  });
                  console.log('[LEDGER] REFERRAL_SKIPPED recorded', {
                    sessionId: session.id,
                    userId: buyerUser.id,
                    reason: 'ref_valid_false',
                  });
                } catch (ledgerErr) {
                  console.error('[LEDGER] Failed to record REFERRAL_SKIPPED', {
                    error: ledgerErr.message,
                    sessionId: session.id,
                    stack: ledgerErr.stack,
                  });
                }
              }
            } else if (!ref && buyerUser) {
              // No referral code - still record skipped for auditability
              // Use prisma singleton directly (prismaClient is scoped inside if(prisma) block)
              if (prisma) {
                try {
                  ensureDatabaseUrl(); // Ensure DATABASE_URL is set
                  await recordLedgerEntry(prisma, {
                    sessionId: session.id,
                    userId: buyerUser.id,
                    type: 'REFERRAL_SKIPPED',
                    amount: 0,
                    currency: 'usd',
                    note: `Referral skipped: no valid referral code`,
                    meta: {
                      reason: 'no_referral_code',
                      purchaseId: createdPurchase?.id || existingPurchase?.id || null,
                    },
                  });
                  console.log('[LEDGER] REFERRAL_SKIPPED recorded', {
                    sessionId: session.id,
                    userId: buyerUser.id,
                    reason: 'no_referral_code',
                  });
                } catch (ledgerErr) {
                  console.error('[LEDGER] Failed to record REFERRAL_SKIPPED', {
                    error: ledgerErr.message,
                    sessionId: session.id,
                    stack: ledgerErr.stack,
                  });
                }
              }
            }

            // ===== SEND PURCHASE CONFIRMATION EMAIL (LAST STEP - AFTER ALL DB OPERATIONS) =====
            // Sequence: resolve buyer → upsert Customer → create Purchase → award points → process referral → send email
            // Only send email if Purchase was successfully created
            const finalPurchase = createdPurchase || existingPurchase;
            if (!finalPurchase) {
              console.error('[WEBHOOK] Cannot send purchase email - Purchase was not created', {
                sessionId: session.id,
                buyerFound: !!buyerUser,
                customerEmail: customerEmail || 'MISSING',
              });
              // Return 500 so Stripe retries - Purchase creation is critical
              return res.status(500).json({ 
                error: 'Purchase creation failed - cannot send email',
                details: 'Purchase record was not created successfully'
              });
            }

            // Build download URL for eBook purchases (ebook) and free ebook for paperback purchases
            // Use APP_BASE_URL for testing (ngrok), fallback to SITE_URL, then production
            let downloadUrl = null;
            if (product === 'ebook' || product === 'paperback') {
              const siteUrl = process.env.APP_BASE_URL || envConfig.SITE_URL || 'https://theagnesprotocol.com';
              downloadUrl = `${siteUrl}/ebook/download?session_id=${encodeURIComponent(session.id)}`;
              console.log('[WEBHOOK] Generated download URL', { siteUrl, downloadUrl, product });
            }

            // Send purchase confirmation email (GUARANTEED - returns 500 on failure)
            if (!customerEmail) {
              console.warn('[WEBHOOK] Cannot send purchase email - missing customer email', {
                sessionId: session.id,
                purchaseId: finalPurchase.id,
              });
              // Return 500 so Stripe retries - email is required
              return res.status(500).json({ 
                error: 'Purchase email failed - missing customer email',
                details: 'Customer email is required to send purchase confirmation'
              });
            }

            console.log('[WEBHOOK] Email: sendPurchaseConfirmation START sessionId=' + session.id + ' purchaseId=' + finalPurchase.id + ' to=' + customerEmail + ' template=purchase_confirmation');
            
            try {
              const client = getMailchimpClient();
              const emailSystem = client ? 'Mailchimp Transactional API' : 'NOT CONFIGURED';
              console.log('[WEBHOOK] Email system selected:', emailSystem);
              
              if (!client) {
                console.error('[WEBHOOK] Cannot send purchase email - Mailchimp not configured');
                // Return 500 so Stripe retries - email is required
                return res.status(500).json({ 
                  error: 'Purchase email failed - Mailchimp not configured',
                  details: 'MAILCHIMP_TRANSACTIONAL_KEY is missing'
                });
              }

              const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
              
              // Build purchase confirmation email
              // Get buyer's total points - try multiple methods
              let buyerTotalPoints = null;
              if (prisma) {
                try {
                  ensureDatabaseUrl(); // Ensure before query
                  
                  // Method 1: If buyerUser was found, use their ID
                  if (buyerUser && buyerUser.id) {
                    const buyerWithPoints = await prisma.user.findUnique({
                      where: { id: buyerUser.id },
                      select: { points: true },
                    });
                    if (buyerWithPoints) {
                      buyerTotalPoints = buyerWithPoints.points;
                    }
                  }
                  
                  // Method 2: If buyerUser not found, try by email (fallback)
                  if (buyerTotalPoints === null && customerEmail) {
                    const normalizedEmail = normalizeEmail(customerEmail);
                    if (normalizedEmail) {
                      ensureDatabaseUrl(); // Ensure before query
                      const buyerByEmail = await prisma.user.findUnique({
                        where: { email: normalizedEmail },
                        select: { points: true },
                      });
                      if (buyerByEmail) {
                        buyerTotalPoints = buyerByEmail.points;
                        console.log('[WEBHOOK] Fetched buyer points by email fallback', {
                          email: normalizedEmail,
                          points: buyerTotalPoints,
                        });
                      }
                    }
                  }
                } catch (pointsErr) {
                  console.warn('[WEBHOOK] Failed to fetch buyer points for email', {
                    error: pointsErr.message,
                    buyerId: buyerUser?.id || 'none',
                    customerEmail: customerEmail || 'none',
                  });
                }
              }
              
              // Get actual points award result (or default if not awarded yet)
              const pointsAwardResult = purchaseAwardResultForEmail || { awarded: 0, reason: 'not_awarded_yet' };
              
              const { subject, text, html } = buildPurchaseConfirmationEmail({
                email: customerEmail,
                sessionId: session.id,
                product: product || 'unknown',
                amountTotal: session.amount_total || 0,
                currency: session.currency || 'usd',
                downloadUrl,
                pointsAwarded: pointsAwardResult, // Pass full award result
                totalPoints: buyerTotalPoints, // Total points user has
              });
              
              // Apply global email banner
              const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
                html,
                text,
                subject,
              });
              
              // Send email
              const emailResult = await client.messages.send({
                message: {
                  from_email: fromEmail,
                  from_name: 'The Agnes Protocol',
                  subject: finalSubject || subject,
                  to: [{ email: customerEmail, type: 'to' }],
                  text: finalText || text,
                  html: finalHtml || html,
                },
              });
              
              // Log full Mailchimp Transactional API response JSON for debugging
              console.log('[WEBHOOK] Email: Mailchimp Transactional API response JSON:', JSON.stringify(emailResult, null, 2));
              
              // Normalize provider response to canonical delivery outcome
              const deliveryOutcome = normalizeEmailDeliveryOutcome(emailResult);
              
              // Log appropriately based on delivery status (honest logs)
              if (deliveryOutcome.deliveryStatus === 'rejected') {
                // REJECTED: Log as warning, do not say "sent successfully"
                console.warn('[WEBHOOK] Email rejected by provider', {
                  email: customerEmail,
                  providerMessageId: deliveryOutcome.providerMessageId,
                  rejectReason: deliveryOutcome.rejectReason,
                  sessionId: session.id,
                  purchaseId: finalPurchase.id,
                  rawStatus: deliveryOutcome.rawStatus,
                });
              } else if (deliveryOutcome.deliveryStatus === 'sent' || deliveryOutcome.deliveryStatus === 'queued') {
                // SENT/QUEUED: Log as info, email accepted by provider
                console.log('[WEBHOOK] Email accepted by provider', {
                  email: customerEmail,
                  providerMessageId: deliveryOutcome.providerMessageId,
                  deliveryStatus: deliveryOutcome.deliveryStatus,
                  sessionId: session.id,
                  purchaseId: finalPurchase.id,
                  queuedReason: deliveryOutcome.queuedReason || null,
                });
              } else {
                // ERROR: Log as error
                console.error('[WEBHOOK] Email send failed', {
                  email: customerEmail,
                  providerMessageId: deliveryOutcome.providerMessageId,
                  deliveryStatus: deliveryOutcome.deliveryStatus,
                  rejectReason: deliveryOutcome.rejectReason,
                  rawStatus: deliveryOutcome.rawStatus,
                  sessionId: session.id,
                  purchaseId: finalPurchase.id,
                });
              }
              
              // Persist email delivery outcome in Ledger (idempotent per sessionId)
              if (prisma && buyerUser) {
                try {
                  ensureDatabaseUrl();
                  
                  // Build note string: concise status + reason
                  let note = `status=${deliveryOutcome.deliveryStatus}`;
                  if (deliveryOutcome.rejectReason) {
                    note += ` reason=${deliveryOutcome.rejectReason}`;
                  }
                  if (deliveryOutcome.queuedReason) {
                    note += ` queued=${deliveryOutcome.queuedReason}`;
                  }
                  if (deliveryOutcome.providerMessageId !== 'unknown') {
                    note += ` msgId=${deliveryOutcome.providerMessageId}`;
                  }
                  
                  // Store in ledger with EMAIL_PURCHASE_CONFIRMATION type
                  await recordLedgerEntry(prisma, {
                    sessionId: session.id,
                    userId: buyerUser.id,
                    type: 'EMAIL_PURCHASE_CONFIRMATION',
                    amount: 0,
                    currency: 'email',
                    note: note,
                    meta: {
                      attemptedAt: new Date().toISOString(),
                      providerMessageId: deliveryOutcome.providerMessageId,
                      deliveryStatus: deliveryOutcome.deliveryStatus,
                      rejectReason: deliveryOutcome.rejectReason,
                      queuedReason: deliveryOutcome.queuedReason,
                      email: customerEmail,
                      rawStatus: deliveryOutcome.rawStatus,
                    },
                  });
                  
                  console.log('[WEBHOOK] Email delivery outcome stored in ledger', {
                    deliveryStatus: deliveryOutcome.deliveryStatus,
                    providerMessageId: deliveryOutcome.providerMessageId,
                    sessionId: session.id,
                  });
                } catch (ledgerErr) {
                  // Don't fail webhook if ledger write fails - email was still attempted
                  console.warn('[WEBHOOK] Failed to store email delivery outcome in ledger', {
                    error: ledgerErr.message,
                    sessionId: session.id,
                    deliveryStatus: deliveryOutcome.deliveryStatus,
                  });
                }
              }
              
              // Webhook flow continues regardless of email delivery status
              // Purchase, points, and ledger entries are already created above
              // Email delivery outcome is tracked in ledger for observability
            } catch (emailErr) {
              // Email send failed (API call threw, timeout, etc.)
              console.error('[WEBHOOK] Email send failed', {
                error: emailErr.message,
                stack: emailErr.stack,
                sessionId: session.id,
                purchaseId: finalPurchase.id,
                email: customerEmail,
              });
              
              // Record error outcome in ledger
              if (prisma && buyerUser) {
                try {
                  ensureDatabaseUrl();
                  const errorOutcome = {
                    deliveryStatus: 'error',
                    providerMessageId: 'unknown',
                    rejectReason: `Send error: ${emailErr.message}`,
                    queuedReason: null,
                    rawStatus: 'error',
                  };
                  
                  await recordLedgerEntry(prisma, {
                    sessionId: session.id,
                    userId: buyerUser.id,
                    type: 'EMAIL_PURCHASE_CONFIRMATION',
                    amount: 0,
                    currency: 'email',
                    note: `status=error reason=${emailErr.message}`,
                    meta: {
                      attemptedAt: new Date().toISOString(),
                      providerMessageId: 'unknown',
                      deliveryStatus: 'error',
                      rejectReason: `Send error: ${emailErr.message}`,
                      queuedReason: null,
                      email: customerEmail,
                      rawStatus: 'error',
                      errorDetails: emailErr.stack || emailErr.message,
                    },
                  });
                } catch (ledgerErr) {
                  console.warn('[WEBHOOK] Failed to store email error in ledger', {
                    error: ledgerErr.message,
                    sessionId: session.id,
                  });
                }
              }
              
              // Continue webhook flow - do not return 500
              // Email delivery failure does not block purchase completion
              // Purchase, points, and ledger entries are already created above
              console.log('[WEBHOOK] Email send failed but webhook continues - purchase completed successfully', {
                sessionId: session.id,
                purchaseId: finalPurchase.id,
              });
            }
          }
          
          } catch (checkoutErr) {
            console.error('[WEBHOOK] checkout.session.completed ERROR', checkoutErr?.stack || checkoutErr);
            console.error('[WEBHOOK] checkout.session.completed FATAL ERROR', {
              error: checkoutErr.message,
              stack: checkoutErr.stack,
              eventId: event.id,
              sessionId: event.data?.object?.id || 'unknown',
            });
            // Don't break - let it fall through to default handler
            throw checkoutErr; // Re-throw so outer catch can handle it
          }
          
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          console.log('[WEBHOOK] payment_intent.succeeded', {
            id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
          });
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          console.warn('[WEBHOOK] payment_intent.payment_failed', {
            id: paymentIntent.id,
            last_payment_error: paymentIntent.last_payment_error,
          });
          break;
        }

        default:
          console.log('[WEBHOOK] Unhandled event type:', event.type);
      }

      // ===== STEP 4: LOG FINAL SUCCESS =====
      console.log('[WEBHOOK] ✅ Webhook processing completed successfully', {
        eventType: event.type,
        eventId: event.id,
        timestamp: new Date().toISOString(),
      });
      console.log('='.repeat(80));

      // Return 200 quickly to acknowledge receipt
      return res.status(200).json({ received: true, eventType: event.type });
    } catch (err) {
      // ===== STEP 3: FAIL LOUDLY =====
      console.error('[WEBHOOK] ❌ UNEXPECTED WEBHOOK ERROR', {
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      });
      console.log('='.repeat(80));
      return res.status(500).json({ 
        error: 'Webhook processing error',
        details: err.message 
      });
    }
  }
);

// ===== STEP 5: LOG WEBHOOK ENDPOINT INFO =====
const webhookPath = '/api/stripe/webhook';
const siteUrl = envConfig.SITE_URL;
console.log('[WEBHOOK_CONFIG] Webhook endpoint configured:', {
  path: webhookPath,
  fullPath: `${siteUrl}${webhookPath}`,
  note: 'Stripe Dashboard should point to: <your-ngrok-url>/api/stripe/webhook',
  currentSiteUrl: siteUrl,
});

/**
 * Process referral commission: award points, record commission, track friend savings, send email
 * Math Mode v2: Sponsor gets +5000 points, $2 commission, and friend savings credit
 * Includes idempotency guard to prevent duplicate processing
 */
async function processReferralCommission({ referrerCode, buyerEmail, buyerUserId, sessionId, product, amountTotal, session, metadata, purchaseId = null, purchaseDay = null }) {
  // Use singleton prisma (already has explicit datasourceUrl)
  const prismaClient = prisma;
  
  // Normalize referrer code safely
  const normalizedReferrerCode = normalizeReferralCode(referrerCode);
  if (!normalizedReferrerCode) {
    console.warn('[ATTRIBUTION_REFERRER] Invalid referrer code, skipping commission', { referrerCode });
    return;
  }
  
  console.log('[WEBHOOK] Processing referral commission', {
    referrerCode: normalizedReferrerCode,
    sessionId,
    product,
    buyerUserId: buyerUserId || 'unknown',
    hasPrisma: !!prismaClient,
  });

  // Idempotency check: has this session already been processed?
  if (prismaClient) {
    try {
      ensureDatabaseUrl(); // Ensure before query
      const existing = await prismaClient.referralConversion.findUnique({
        where: { stripeSessionId: sessionId },
      });
      
      if (existing) {
        console.log('[WEBHOOK] Referral commission already processed (idempotency)', {
          sessionId,
          referrerCode: normalizedReferrerCode,
        });
        return; // Already processed, skip
      }
    } catch (err) {
      console.warn('[WEBHOOK] Idempotency check failed, continuing anyway', {
        error: err.message,
      });
    }
  }

  // Look up referrer by code (with total earnings and points)
  let referrer = null;
  let totalEarningsCents = 0;
  let totalPoints = 0;
  let totalSavingsCents = 0;
  
  if (prismaClient) {
    try {
      ensureDatabaseUrl(); // Ensure before query
      referrer = await prismaClient.user.findFirst({
        where: {
          referralCode: normalizedReferrerCode,
        },
        select: {
          id: true,
          email: true,
          referralCode: true,
          referralEarningsCents: true,
        },
      });
      
      if (referrer) {
        totalEarningsCents = referrer.referralEarningsCents || 0;
        // A1: Use centralized points rollup (single source of truth)
        // Calculate total points from ledger (matches scorecard/UI)
        try {
          ensureDatabaseUrl(); // Ensure before query
          const pointsRollup = await getPointsRollupForUser(prismaClient, referrer.id);
          totalPoints = pointsRollup.totalPoints;
          
          // Calculate total savings from ReferralConversion (for email display)
          const conversions = await prismaClient.referralConversion.findMany({
            where: {
              referrerUserId: referrer.id,
            },
            select: {
              savingsCents: true,
              commissionCents: true,
            },
          });
          totalSavingsCents = conversions.reduce((sum, conv) => sum + (conv.savingsCents || 0), 0);
          // Calculate total earnings from commissionCents (for email display)
          const totalCommissionCents = conversions.reduce((sum, conv) => sum + (conv.commissionCents || 0), 0);
          // Update totalEarningsCents if we calculated it from conversions
          if (totalCommissionCents > 0) {
            totalEarningsCents = totalCommissionCents;
          }
        } catch (pointsErr) {
          console.warn('[WEBHOOK] Failed to calculate totals (non-fatal)', {
            error: pointsErr.message,
            note: 'Email will still be sent with default totals',
          });
          // Use defaults if we can't count - email will still be sent
          totalPoints = 0;
          totalSavingsCents = 0;
        }
        
        // Structured logging: referrer found
        console.log('[ATTRIBUTION_REFERRER] Referrer found', {
          referrerId: referrer.id,
          referrerCode: referrer.referralCode,
          referrerEmail: referrer.email || 'MISSING',
          totalEarningsCents,
          totalPoints,
          totalSavingsCents,
        });
      } else {
        console.warn('[ATTRIBUTION_REFERRER] Referrer not found', {
          referrerCode: normalizedReferrerCode,
          sessionId,
        });
      }
    } catch (err) {
      console.error('[WEBHOOK] Failed to lookup referrer', {
        error: err.message,
        referrerCode: normalizedReferrerCode,
        stack: err.stack,
      });
    }
  }

  // Fallback to allowlist if Prisma lookup failed or Prisma unavailable
  if (!referrer) {
    const allowlist = envConfig.ASSOCIATE_REF_ALLOWLIST || [];
    const isDevOrTest = process.env.NODE_ENV === 'development' || envConfig.STRIPE_MODE === 'test';
    const devFormatMatch = /^[A-Z0-9]{6}$/i.test(normalizedReferrerCode);
    const inAllowlist = allowlist.includes(normalizedReferrerCode);
    
    if (inAllowlist || (isDevOrTest && devFormatMatch)) {
      // Create a mock referrer object for allowlist fallback
      // We'll use a placeholder email from env or skip email sending
      const allowlistEmail = process.env.ALLOWLIST_FALLBACK_EMAIL || null;
      
      if (allowlistEmail && normalizeEmail(allowlistEmail)) {
        referrer = {
          id: 'allowlist-fallback',
          email: allowlistEmail,
          referralCode: normalizedReferrerCode,
          referralEarningsCents: 0,
        };
        console.log('[WEBHOOK] Using allowlist fallback for referrer', {
          referrerCode: normalizedReferrerCode,
          email: allowlistEmail,
        });
      } else {
        console.warn('[WEBHOOK] Referral code valid but no email available for allowlist fallback', {
          referrerCode: normalizedReferrerCode,
          note: 'Set ALLOWLIST_FALLBACK_EMAIL env var to enable commission emails for allowlist codes',
        });
        return; // Can't send email without address
      }
    } else {
      console.warn('[WEBHOOK] Referrer not found and not in allowlist', { referrerCode: normalizedReferrerCode });
      return; // Unknown referrer, skip
    }
  }
  
  // Safely normalize referrer email
  const referrerEmail = normalizeEmail(referrer.email);
  if (!referrerEmail) {
    console.warn('[WEBHOOK] Referrer found but email is missing', { 
      referrerId: referrer.id,
      referrerCode: normalizedReferrerCode,
    });
    return; // Can't send email without address
  }

  // Constants (Math Mode v2)
  const COMMISSION_CENTS = 200; // $2.00 commission per referred purchase (fixed for all products)
  
  // Store referral points award result for email template (will be set when points are awarded)
  let referralAwardResult = null;

  // Calculate discount amount from Stripe session (Math Mode v2 - friend savings)
  // Priority order:
  // 1. session.total_details.amount_discount (in cents)
  // 2. Sum of discount_amounts[].amount from session.total_details.breakdown.discounts
  // 3. Compute: (undiscounted_subtotal - session.amount_subtotal) if available
  // 4. Fallback: 0 (still award points + commission, but record savings as 0)
  let discountCents = 0;
  
  if (session) {
    // Priority 1: session.total_details.amount_discount
    if (session.total_details?.amount_discount !== undefined && session.total_details.amount_discount !== null) {
      discountCents = Math.max(0, session.total_details.amount_discount);
      console.log('[WEBHOOK] Discount calculated from total_details.amount_discount', { discountCents, sessionId });
    }
    // Priority 2: Sum discount_amounts from breakdown.discounts
    else if (session.total_details?.breakdown?.discounts && Array.isArray(session.total_details.breakdown.discounts)) {
      discountCents = session.total_details.breakdown.discounts.reduce((sum, discount) => {
        return sum + (discount.amount || 0);
      }, 0);
      console.log('[WEBHOOK] Discount calculated from breakdown.discounts', { discountCents, sessionId });
    }
    // Priority 3: Compute from subtotals (if available)
    else if (session.total_details?.amount_subtotal !== undefined && session.amount_subtotal !== undefined) {
      // This is a fallback - we'd need the undiscounted subtotal, which Stripe doesn't always provide
      // For now, skip this method
      console.log('[WEBHOOK] Discount calculation: subtotal method not available', { sessionId });
    }
    
    // If still 0, log but don't fail (still award points + commission)
    if (discountCents === 0) {
      console.log('[WEBHOOK] Discount not available in session payload - recording as 0', {
        sessionId,
        note: 'Points and commission still awarded, but friend savings will be 0',
      });
    }
  } else {
    console.warn('[WEBHOOK] Session object not provided - cannot calculate discount', { sessionId });
  }
  
  const productType = product || 'ebook';

  // Record commission (with idempotency)
  if (prismaClient && referrer.id !== 'allowlist-fallback') {
    try {
      ensureDatabaseUrl(); // Ensure before transaction
      await prismaClient.$transaction(async (tx) => {
        // Part F2 + G5: Create referral conversion record (idempotency key: sessionId)
        // Use upsert to make it idempotent - safe to retry webhook events
        // Part G5: Product is required here (validated earlier in webhook)
        // Include all fields: referralCode, savingsCents, amountPaidCents, product, currency
        await tx.referralConversion.upsert({
          where: { stripeSessionId: sessionId },
          create: {
            referralCode: normalizedReferrerCode, // Required field - use the referral code
            buyerEmail: normalizeEmail(buyerEmail) || null,
            stripeSessionId: sessionId,
            commissionCents: COMMISSION_CENTS,
            savingsCents: discountCents ?? 0, // Money saved by buyer (discount amount)
            amountPaidCents: amountTotal || 0, // Amount buyer actually paid (after discount)
            product: productType, // Part G5: Required - must be explicitly set (validated earlier)
            currency: 'usd', // Default currency
            // ✅ connect via relation (this is what Prisma expects)
            referrer: { connect: { id: referrer.id } },
          },
          update: {
            // If conversion already exists, update it (idempotent retry)
            referralCode: normalizedReferrerCode,
            buyerEmail: normalizeEmail(buyerEmail) || null,
            commissionCents: COMMISSION_CENTS,
            savingsCents: discountCents ?? 0,
            amountPaidCents: amountTotal || 0,
            product: productType, // Part G5: Required - must be explicitly set
            currency: 'usd',
            referrer: { connect: { id: referrer.id } },
          },
        });

        // Update referrer earnings (commission only - points and savings tracked in ledger)
        await tx.user.update({
          where: { id: referrer.id },
          data: {
            referralEarningsCents: {
              increment: COMMISSION_CENTS,
            },
          },
        });
      });
      
      // Award referral sponsor points (Math Mode - deterministic, no caps)
      referralAwardResult = await awardReferralSponsorPoints(prismaClient, {
        referrerUserId: referrer.id,
        sessionId: sessionId, // Required for idempotency
        buyerUserId: buyerUserId || null,
        product: productType, // ebook, paperback, audio_preorder
      });

      console.log('[WEBHOOK] Referral commission recorded', {
        referrerCode: normalizedReferrerCode,
        referrerId: referrer.id,
        commissionCents: COMMISSION_CENTS,
        discountCents,
        pointsAwarded: referralAwardResult.awarded,
        reason: referralAwardResult.reason,
        sessionId,
      });
      
      // Part C: Calculate totals (non-fatal - email will be sent even if this fails)
      // Wrap in try/catch so totals failure doesn't block email
      try {
        ensureDatabaseUrl(); // Ensure before query
        const updatedReferrer = await prismaClient.user.findUnique({
          where: { id: referrer.id },
          select: {
            referralEarningsCents: true,
          },
        });
        if (updatedReferrer) {
          totalEarningsCents = updatedReferrer.referralEarningsCents || 0;
        }
        
        // A1: Use centralized points rollup (single source of truth)
        ensureDatabaseUrl(); // Ensure before query
        const pointsRollup = await getPointsRollupForUser(prismaClient, referrer.id);
        totalPoints = pointsRollup.totalPoints;
        
        // Calculate total savings from ReferralConversion (for email display)
        const conversions = await prismaClient.referralConversion.findMany({
          where: {
            referrerUserId: referrer.id,
          },
          select: {
            savingsCents: true,
            commissionCents: true,
          },
        });
        totalSavingsCents = conversions.reduce((sum, conv) => sum + (conv.savingsCents || 0), 0);
        // Calculate total earnings from commissionCents
        const totalCommissionCents = conversions.reduce((sum, conv) => sum + (conv.commissionCents || 0), 0);
        if (totalCommissionCents > 0) {
          totalEarningsCents = totalCommissionCents;
        }
        
        console.log('[ATTRIBUTION_REFERRER] Totals calculated', {
          referrerId: referrer.id,
          totalEarningsCents,
          totalPoints,
          totalSavingsCents,
          conversionCount: conversions.length,
        });
      } catch (totalsErr) {
        console.warn('[WEBHOOK] Failed to calculate totals (non-fatal - email will still be sent)', {
          error: totalsErr.message,
          referrerId: referrer.id,
          note: 'Email will be sent with default totals',
        });
        // Use defaults - email will still be sent
        totalPoints = referralAwardResult?.awarded || 0;
        totalSavingsCents = discountCents || 0;
      }
      
      // ===== LEDGER: Record Referral Commission Earned (for referrer) - Math Mode v2 =====
      // Idempotency: unique constraint on (sessionId, type, userId)
      try {
        await recordLedgerEntry(prismaClient, {
          sessionId: sessionId,
          userId: referrer.id,
          type: 'REFERRAL_COMMISSION_EARNED',
          amount: COMMISSION_CENTS,
          currency: 'usd',
          usd: COMMISSION_CENTS / 100, // Store as Decimal
          note: `Commission earned from referral: $${(COMMISSION_CENTS / 100).toFixed(2)}`,
          meta: {
            referrerCode: normalizedReferrerCode,
            buyerUserId: buyerUserId || null,
            buyerEmail: normalizeEmail(buyerEmail) || null,
            product: productType,
            purchaseId: purchaseId || null,
            discountCents: discountCents,
          },
        });
        console.log('[LEDGER] REFERRAL_COMMISSION_EARNED recorded', {
          sessionId,
          referrerId: referrer.id,
          commissionCents: COMMISSION_CENTS,
        });
      } catch (ledgerErr) {
        // Handle idempotency (already exists)
        if (ledgerErr.code === 'P2002' || ledgerErr.message?.includes('Unique constraint')) {
          console.log('[LEDGER] REFERRAL_COMMISSION_EARNED already exists (idempotent)', {
            sessionId,
            referrerId: referrer.id,
          });
        } else {
          console.error('[LEDGER] Failed to record REFERRAL_COMMISSION_EARNED', {
            error: ledgerErr.message,
            sessionId,
            referrerId: referrer.id,
          });
        }
        // Don't fail - ledger is for auditability
      }
      
      // ===== LEDGER: Record Friend Savings Credited (for referrer) - Math Mode v2 =====
      // Idempotency: unique constraint on (sessionId, type, userId)
      try {
        await recordLedgerEntry(prismaClient, {
          sessionId: sessionId,
          userId: referrer.id,
          type: 'FRIEND_SAVINGS_CREDITED',
          amount: discountCents,
          currency: 'usd',
          usd: discountCents / 100, // Store as Decimal
          note: discountCents > 0 
            ? `Friend savings credited: $${(discountCents / 100).toFixed(2)}`
            : 'Friend savings credited: $0.00 (discount not available in session payload)',
          meta: {
            referrerCode: normalizedReferrerCode,
            buyerUserId: buyerUserId || null,
            buyerEmail: normalizeEmail(buyerEmail) || null,
            product: productType,
            purchaseId: purchaseId || null,
            discountCents: discountCents,
            discountSource: discountCents > 0 ? 'stripe_session' : 'not_available',
          },
        });
        console.log('[LEDGER] FRIEND_SAVINGS_CREDITED recorded', {
          sessionId,
          referrerId: referrer.id,
          discountCents,
        });
      } catch (ledgerErr) {
        // Handle idempotency (already exists)
        if (ledgerErr.code === 'P2002' || ledgerErr.message?.includes('Unique constraint')) {
          console.log('[LEDGER] FRIEND_SAVINGS_CREDITED already exists (idempotent)', {
            sessionId,
            referrerId: referrer.id,
          });
        } else {
          console.error('[LEDGER] Failed to record FRIEND_SAVINGS_CREDITED', {
            error: ledgerErr.message,
            sessionId,
            referrerId: referrer.id,
          });
        }
        // Don't fail - ledger is for auditability
      }
      
      // ===== LEDGER: Record Referral Discount Applied (for buyer) =====
      if (buyerUserId && discountCents > 0) {
        try {
          await recordLedgerEntry(prismaClient, {
            sessionId: sessionId,
            userId: buyerUserId,
            type: 'REFERRAL_DISCOUNT_APPLIED',
            amount: -discountCents, // Negative amount (discount)
            currency: 'usd',
            note: `Discount applied from referral code: $${(discountCents / 100).toFixed(2)}`,
            meta: {
              referrerCode: normalizedReferrerCode,
              referrerUserId: referrer.id,
              product: productType,
              purchaseId: purchaseId || null,
              discountCents: discountCents,
            },
          });
        } catch (ledgerErr) {
          console.error('[LEDGER] Failed to record REFERRAL_DISCOUNT_APPLIED', {
            error: ledgerErr.message,
            sessionId,
            buyerUserId,
          });
          // Don't fail - ledger is for auditability
        }
      }
      
      // Totals calculation is now done above (non-fatal, wrapped in try/catch)
      // Log commission awarded
      console.log('[ATTRIBUTION_REFERRER] Commission awarded', {
        referrerId: referrer.id,
        referrerCode: referrer.referralCode,
        referrerEmail: referrerEmail,
        pointsAwarded: referralAwardResult?.awarded || 0,
        commissionCents: COMMISSION_CENTS,
        discountCentsThisPurchase: discountCents,
        discountCentsTotal: totalSavingsCents,
        totalEarningsCents,
        totalPoints,
      });
    } catch (err) {
      // Handle unique constraint violation (idempotency)
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        console.log('[WEBHOOK] Referral commission already recorded (unique constraint)', {
          sessionId,
        });
        // Part C: Still fetch totals for email even if already processed (non-fatal)
        try {
          ensureDatabaseUrl(); // Ensure before query
          const updatedReferrer = await prismaClient.user.findUnique({
            where: { id: referrer.id },
            select: {
              referralEarningsCents: true,
            },
          });
          if (updatedReferrer) {
            totalEarningsCents = updatedReferrer.referralEarningsCents || 0;
          }
          // A1: Use centralized points rollup (single source of truth)
          ensureDatabaseUrl(); // Ensure before query
          const pointsRollup = await getPointsRollupForUser(prismaClient, referrer.id);
          totalPoints = pointsRollup.totalPoints;
          
          // Calculate total savings from ReferralConversion (for email display)
          const conversions = await prismaClient.referralConversion.findMany({
            where: {
              referrerUserId: referrer.id,
            },
            select: {
              savingsCents: true,
              commissionCents: true,
            },
          });
          totalSavingsCents = conversions.reduce((sum, conv) => sum + (conv.savingsCents || 0), 0);
          const totalCommissionCents = conversions.reduce((sum, conv) => sum + (conv.commissionCents || 0), 0);
          if (totalCommissionCents > 0) {
            totalEarningsCents = totalCommissionCents;
          }
        } catch (totalsErr) {
          // Ignore - use defaults, email will still be sent
          console.warn('[WEBHOOK] Failed to fetch totals for already-processed conversion (non-fatal)', {
            error: totalsErr.message,
            note: 'Email will be sent with default totals',
          });
        }
        // Don't return - still send email even if already processed
        // Set referralAwardResult to default if not set
        if (!referralAwardResult) {
          referralAwardResult = { awarded: 0, reason: 'already_processed' };
        }
      } else {
        throw err; // Re-throw other errors
      }
    }
  } else {
    // No Prisma or allowlist fallback - set default award result
    referralAwardResult = { awarded: 0, reason: 'no_prisma_or_allowlist' };
  }

  // Part D: Send referrer commission email (ALWAYS send if referrerEmail exists, regardless of points or totals)
  // Email is sent even if totals calculation failed
  if (referrerEmail) {
    try {
      const client = getMailchimpClient();
      if (!client) {
        console.warn('[WEBHOOK] Cannot send referrer email - Mailchimp not configured');
      } else {
        const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
        
        // Safely extract buyer name from email
        const buyerDisplayName = extractNameFromEmail(buyerEmail);
        
        // Get referral points award result (already computed above)
        const referralPointsAwardResult = referralAwardResult || { awarded: 0, reason: 'not_awarded' };
        
        // B1: Recalculate rollup RIGHT BEFORE email to ensure it includes all newly awarded points
        // This ensures AP sale email totals match /api/points/me exactly
        let finalTotalPoints = totalPoints;
        try {
          ensureDatabaseUrl();
          const finalRollup = await getPointsRollupForUser(prismaClient, referrer.id);
          finalTotalPoints = finalRollup.totalPoints;
          console.log('[AP_SALE_EMAIL] Final rollup calculated', {
            referrerId: referrer.id,
            finalTotalPoints,
            previousTotalPoints: totalPoints,
            pointsAwardedThisPurchase: referralPointsAwardResult.awarded,
            note: 'Using rollup total directly (includes all points including this purchase)',
          });
        } catch (rollupErr) {
          console.warn('[AP_SALE_EMAIL] Failed to recalculate rollup before email (using previous total)', {
            error: rollupErr.message,
            referrerId: referrer.id,
            fallbackTotalPoints: totalPoints,
          });
          // Use previous totalPoints as fallback
        }
        
        // Part C: Compute totals safely (use defaults if calculation failed)
        // These are for email display only - email will be sent even with defaults
        const safeTotalEarningsCents = totalEarningsCents + COMMISSION_CENTS;
        // B1: Use finalTotalPoints directly from rollup (already includes all points)
        const safeTotalPoints = finalTotalPoints;
        const safeTotalSavingsCents = totalSavingsCents + discountCents;
        
        const { subject, text, html } = buildReferrerCommissionEmail({
          referrerEmail: referrerEmail,
          referrerCode: normalizedReferrerCode,
          buyerName: buyerDisplayName,
          product: product || 'unknown',
          commissionCents: COMMISSION_CENTS,
          pointsAwarded: referralPointsAwardResult, // Pass full award result
          savingsCents: discountCents, // Money saved by this buyer (discount amount)
          totalEarningsCents: safeTotalEarningsCents,
          totalPoints: safeTotalPoints, // B1: Use rollup total directly (matches /api/points/me)
          totalSavingsCents: safeTotalSavingsCents,
        });

        const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
          html,
          text,
          subject,
        });

        // Part E: Loud log line for AP sale email
        // B1: Log that we're using rollup total (matches /api/points/me)
        console.log('[AP_SALE_EMAIL] START', {
          sessionId,
          referrerEmail,
          totalPoints: safeTotalPoints, // B1: This matches /api/points/me total
          pointsAwardedThisPurchase: referralPointsAwardResult.awarded,
          note: 'totalPoints from rollup (single source of truth)',
          buyerEmail: buyerEmail || 'unknown',
          referralCode: normalizedReferrerCode,
          commissionCents: COMMISSION_CENTS,
          discountCents,
          pointsAwarded: referralPointsAwardResult.awarded,
          purchaseId: purchaseId || 'none',
        });
        
        let emailResult = null;
        try {
          emailResult = await client.messages.send({
            message: {
              from_email: fromEmail,
              from_name: 'The Agnes Protocol',
              subject: finalSubject || subject,
              to: [{ email: referrerEmail, type: 'to' }],
              text: finalText || text,
              html: finalHtml || html,
            },
          });

          console.log('[AP_SALE_EMAIL] OK', {
            sessionId,
            referrerEmail,
            status: 'sent',
            emailResult: Array.isArray(emailResult) ? emailResult.length : 'object',
          });
        } catch (sendErr) {
          console.error('[WEBHOOK] AP sale email send failed', {
            error: sendErr.message,
            referrerEmail: referrerEmail,
            sessionId,
          });
          // Continue - email failure doesn't block webhook
        }

        // Part C2: Track email delivery outcome in ledger
        if (prismaClient && referrer) {
          try {
            ensureDatabaseUrl();
            const deliveryOutcome = emailResult ? normalizeEmailDeliveryOutcome(emailResult) : {
              deliveryStatus: 'error',
              providerMessageId: 'unknown',
              rejectReason: 'Send failed',
              queuedReason: null,
              rawStatus: 'error',
            };

            let note = `status=${deliveryOutcome.deliveryStatus}`;
            if (deliveryOutcome.rejectReason) {
              note += ` reason=${deliveryOutcome.rejectReason}`;
            }
            if (deliveryOutcome.queuedReason) {
              note += ` queued=${deliveryOutcome.queuedReason}`;
            }
            if (deliveryOutcome.providerMessageId !== 'unknown') {
              note += ` msgId=${deliveryOutcome.providerMessageId}`;
            }

            await recordLedgerEntry(prismaClient, {
              sessionId: sessionId,
              userId: referrer.id,
              type: 'EMAIL_AP_SALE_NOTIFICATION',
              amount: 0,
              currency: 'email',
              note: note,
              meta: {
                attemptedAt: new Date().toISOString(),
                providerMessageId: deliveryOutcome.providerMessageId,
                deliveryStatus: deliveryOutcome.deliveryStatus,
                rejectReason: deliveryOutcome.rejectReason,
                queuedReason: deliveryOutcome.queuedReason,
                email: referrerEmail,
                rawStatus: deliveryOutcome.rawStatus,
                recipientEmail: referrerEmail,
                sessionId: sessionId,
                purchaseId: purchaseId || null,
              },
            });

            console.log('[AP_SALE_EMAIL] Ledger written', {
              deliveryStatus: deliveryOutcome.deliveryStatus,
              providerMessageId: deliveryOutcome.providerMessageId,
              sessionId: sessionId,
              referrerId: referrer.id,
              ledgerType: 'EMAIL_AP_SALE_NOTIFICATION',
            });
          } catch (ledgerErr) {
            // Don't fail webhook if ledger write fails - email was still attempted
            console.warn('[WEBHOOK] Failed to store AP sale email delivery outcome in ledger', {
              error: ledgerErr.message,
              sessionId: sessionId,
            });
          }
        }
      }
    } catch (emailErr) {
      console.error('[WEBHOOK] Failed to send referrer commission email', {
        error: emailErr.message,
        referrerEmail: referrerEmail,
        sessionId,
      });
      // Don't fail webhook - email is non-critical
    }
  }
}

module.exports = router;

