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
const { awardPurchaseDailyPoints, awardReferralPoints } = require('../lib/points/awardPoints.cjs');

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

      // Verify signature and construct event
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error('[WEBHOOK] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      }

      // ===== STEP 2: LOG EVENT.TYPE AND CRITICAL IDs =====
      console.log('[WEBHOOK] Event received:', {
        type: event.type,
        id: event.id,
        livemode: event.livemode,
      });
      
      // Log event type for debugging
      console.log('[WEBHOOK] Processing event type:', event.type);

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          
          // Extract email with multiple fallbacks (preferred order)
          let customerEmail = null;
          if (session.customer_details?.email) {
            customerEmail = session.customer_details.email;
          } else if (session.customer_email) {
            customerEmail = session.customer_email;
          } else if (session.customer && typeof session.customer === 'object' && session.customer.email) {
            customerEmail = session.customer.email;
          }
          
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
          const product = metadata.product || 'unknown';
          const ref = metadata.ref || metadata.referrerCode || null;
          const refValid = metadata.ref_valid === 'true';
          
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
            // Use contest_user_id (PRIMARY) or contest_user_code (fallback)
            // NEVER use email for attribution - only for sending emails
            let buyerUser = null;
            let buyerAttributionMethod = 'none';
            
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
                // PRIMARY: Use contest_user_id if available
                if (contestUserId) {
                  try {
                    // Safely trim contestUserId - handle non-string types
                    const trimmedUserId = typeof contestUserId === 'string' ? contestUserId.trim() : String(contestUserId || '').trim();
                    if (!trimmedUserId) {
                      console.warn('[ATTRIBUTION_BUYER] contestUserId is empty after trimming', { contestUserId });
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
                      console.log('[ATTRIBUTION_BUYER] Found by contest_user_id', {
                        buyerId: buyerUser.id,
                        buyerCode: buyerUser.code || buyerUser.referralCode || 'MISSING',
                        buyerEmail: buyerUser.email || 'MISSING',
                      });
                    }
                  } catch (err) {
                    console.warn('[ATTRIBUTION_BUYER] Error looking up by contest_user_id', {
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
                        console.log('[ATTRIBUTION_BUYER] Found by contest_user_code', {
                          buyerId: buyerUser.id,
                          buyerCode: buyerUser.code || buyerUser.referralCode || 'MISSING',
                          buyerEmail: buyerUser.email || 'MISSING',
                        });
                      }
                    }
                  } catch (err) {
                    console.warn('[ATTRIBUTION_BUYER] Error looking up by contest_user_code', {
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
                        console.log('[ATTRIBUTION_BUYER] Found by email fallback', {
                          buyerId: buyerUser.id,
                          buyerCode: buyerUser.code || buyerUser.referralCode || 'MISSING',
                          buyerEmail: buyerUser.email || 'MISSING',
                          warning: 'Used email fallback - contestUserId/Code were missing from metadata',
                        });
                      }
                    }
                  } catch (err) {
                    console.warn('[ATTRIBUTION_BUYER] Error looking up by email', {
                      error: err.message,
                      customerEmail,
                    });
                  }
                }
                
                // HARD FAIL: No attribution possible
                if (!buyerUser) {
                  console.error('[ATTRIBUTION_BUYER] HARD FAIL - Cannot attribute purchase', {
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
                if (prisma) {
                  try {
                    // Use singleton prisma (standard SQLite, no adapter)
                    const prismaClient = prisma;
                    
                    // CRITICAL: Ensure DATABASE_URL is set before Purchase queries
                    ensureDatabaseUrl();
                    
                    // Idempotency check: has this purchase already been recorded?
                    ensureDatabaseUrl(); // Ensure before query
                    const existingPurchase = await prismaClient.purchase.findUnique({
                      where: { stripeSessionId: session.id },
                    });
                
                if (existingPurchase) {
                  console.log('[ATTRIBUTION_BUYER] Purchase already recorded (idempotency)', {
                    sessionId: session.id,
                    buyerId: existingPurchase.userId || 'MISSING',
                    pointsAwarded: existingPurchase.pointsAwarded,
                  });
                  
                  // Case 1: Buyer was found now but wasn't before (userId was null)
                  // Also update Customer and Fulfillment if missing
                  if (buyerUser && !existingPurchase.userId) {
                    // Upsert Customer first
                    let customerId = existingPurchase.customerId;
                    if (finalEmail && !customerId) {
                      try {
                        ensureDatabaseUrl();
                        const customerData = {
                          email: finalEmail,
                          name: finalName || null,
                          phone: finalPhone || null,
                          shippingStreet: finalAddress?.line1 || null,
                          shippingCity: finalAddress?.city || null,
                          shippingState: finalAddress?.state || null,
                          shippingPostalCode: finalAddress?.postal_code || null,
                          shippingCountry: finalAddress?.country || null,
                        };
                        const customer = await prismaClient.customer.upsert({
                          where: { email: finalEmail },
                          update: customerData,
                          create: customerData,
                        });
                        customerId = customer.id;
                      } catch (customerErr) {
                        console.warn('[CUSTOMER] Failed to upsert customer during retroactive update', {
                          error: customerErr.message,
                        });
                      }
                    }
                    
                    ensureDatabaseUrl(); // Ensure before transaction
                    
                    // Award purchase points using guardrails helper
                    const purchaseAwardResult = await awardPurchaseDailyPoints({
                      userId: buyerUser.id,
                      purchaseId: existingPurchase.id,
                      now: new Date(session.created * 1000),
                    });
                    
                    // Store for email template
                    purchaseAwardResultForEmail = purchaseAwardResult;
                    
                    await prismaClient.purchase.update({
                      where: { stripeSessionId: session.id },
                      data: {
                        userId: buyerUser.id,
                        userCode: buyerUser.code || buyerUser.referralCode || null,
                        customerId: customerId || undefined,
                        paymentIntentId: paymentIntentId || undefined,
                        pointsAwarded: purchaseAwardResult.awarded,
                      },
                    });
                    
                    console.log('[PURCHASE] Purchase points award result (retroactive update)', {
                      userId: buyerUser.id,
                      awarded: purchaseAwardResult.awarded,
                      reason: purchaseAwardResult.reason,
                    });
                    
                    // Ensure Fulfillment exists
                    // Only create fulfillment for physical products (paperback)
                    if (existingPurchase.id && product === 'paperback') {
                      try {
                        ensureDatabaseUrl();
                        const existingFulfillment = await prismaClient.fulfillment.findUnique({
                          where: { purchaseId: existingPurchase.id },
                        });
                        if (!existingFulfillment) {
                          await prismaClient.fulfillment.create({
                            data: {
                              purchaseId: existingPurchase.id,
                              status: 'PENDING',
                            },
                          });
                        }
                      } catch (fulfillmentErr) {
                        // Ignore - non-critical
                      }
                    }
                    
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
                          shippingPostalCode: addr?.postal_code ?? null,
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
                        
                        // Update Purchase with customerId + paymentIntentId (if not already set)
                        if (!existingPurchase.customerId || !existingPurchase.paymentIntentId) {
                          ensureDatabaseUrl();
                          await prismaClient.purchase.update({
                            where: { id: existingPurchase.id },
                            data: {
                              customerId: customer.id,
                              paymentIntentId: paymentIntentId || undefined,
                            },
                          });
                          
                          console.log('[PURCHASE] ✅ linked customer', {
                            purchaseId: existingPurchase.id,
                            customerId: customer.id,
                            paymentIntentId: paymentIntentId || 'none',
                          });
                        }
                        
                        // Ensure Fulfillment exists ONLY for physical products (paperback)
                        // Ebooks and audio_preorder don't need fulfillment
                        if (isPhysicalProduct) {
                          ensureDatabaseUrl();
                          await prismaClient.fulfillment.upsert({
                            where: { purchaseId: existingPurchase.id },
                            create: {
                              purchaseId: existingPurchase.id,
                              status: 'PENDING',
                            },
                            update: {},
                          });
                          
                          console.log('[FULFILLMENT] ✅ ensured', {
                            purchaseId: existingPurchase.id,
                            status: 'PENDING',
                            product: product,
                          });
                        } else {
                          console.log('[FULFILLMENT] ⏭️  Skipped (digital product)', {
                            purchaseId: existingPurchase.id,
                            product: product,
                          });
                        }
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
                      // Award purchase points using guardrails helper
                      const purchaseAwardResult = await awardPurchaseDailyPoints({
                        userId: retroBuyer.id,
                        purchaseId: existingPurchase.id,
                        now: new Date(existingPurchase.createdAt),
                      });
                      
                      await prismaClient.purchase.update({
                        where: { stripeSessionId: session.id },
                        data: {
                          pointsAwarded: purchaseAwardResult.awarded,
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
                          // Award purchase points using guardrails helper
                          const purchaseAwardResult = await awardPurchaseDailyPoints({
                            userId: retroBuyerByEmail.id,
                            purchaseId: existingPurchase.id,
                            now: new Date(existingPurchase.createdAt),
                          });
                          
                          await prismaClient.purchase.update({
                            where: { stripeSessionId: session.id },
                            data: {
                              userId: retroBuyerByEmail.id,
                              userCode: retroBuyerByEmail.code || retroBuyerByEmail.referralCode || null,
                              pointsAwarded: purchaseAwardResult.awarded,
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
                        shippingPostalCode: finalAddress?.postal_code || null,
                        shippingCountry: finalAddress?.country || null,
                      };
                      
                      // Upsert Customer by email
                      const customer = await prismaClient.customer.upsert({
                        where: { email: finalEmail },
                        update: {
                          // Update existing customer with latest shipping info
                          name: customerData.name || undefined,
                          phone: customerData.phone || undefined,
                          shippingStreet: customerData.shippingStreet || undefined,
                          shippingCity: customerData.shippingCity || undefined,
                          shippingState: customerData.shippingState || undefined,
                          shippingPostalCode: customerData.shippingPostalCode || undefined,
                          shippingCountry: customerData.shippingCountry || undefined,
                        },
                        create: customerData,
                      });
                      
                      customerId = customer.id;
                      // ===== STEP 4: LOG SUCCESS =====
                      console.log('[CUSTOMER] ✅ Customer upserted successfully', {
                        customerId: customer.id,
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
                  let createdPurchase = null;
                  try {
                    if (buyerUser) {
                      // Buyer found: create Purchase + award points + fulfillment
                      console.log('[PURCHASE] Creating Purchase with buyer', {
                        sessionId: session.id,
                        buyerId: buyerUser.id,
                        customerId: customerId || 'none',
                        paymentIntentId: paymentIntentId || 'none',
                      });
                      
                      ensureDatabaseUrl(); // Ensure before transaction
                      const purchaseData = {
                        stripeSessionId: session.id,
                        paymentIntentId: paymentIntentId || null,
                        userId: buyerUser.id,
                        userCode: buyerUser.code || buyerUser.referralCode || null,
                        customerId: customerId || null,
                        product: product,
                        amountPaidCents: session.amount_total || 0,
                        pointsAwarded: PURCHASE_POINTS,
                      };
                      
                      // Award purchase points using guardrails helper
                      const purchaseAwardResult = await awardPurchaseDailyPoints({
                        userId: buyerUser.id,
                        purchaseId: null, // Will be set after creation
                        now: new Date(session.created * 1000),
                      });
                      
                      // Store for email template
                      purchaseAwardResultForEmail = purchaseAwardResult;
                      
                      // Update purchaseData with actual points awarded
                      purchaseData.pointsAwarded = purchaseAwardResult.awarded;
                      
                      await prismaClient.purchase.create({
                        data: purchaseData,
                      });
                      
                      // Note: Points already awarded by helper function
                      console.log('[PURCHASE] Purchase points award result', {
                        userId: buyerUser.id,
                        awarded: purchaseAwardResult.awarded,
                        reason: purchaseAwardResult.reason,
                      });
                      
                      // Get the created purchase for fulfillment creation
                      ensureDatabaseUrl(); // Ensure before query
                      createdPurchase = await prismaClient.purchase.findUnique({
                        where: { stripeSessionId: session.id },
                      });
                      
                      // ===== STEP 4: LOG SUCCESS =====
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
                            name: name ?? null,
                            phone: phone ?? null,
                            shippingStreet: addr?.line1 ?? null,
                            shippingCity: addr?.city ?? null,
                            shippingState: addr?.state ?? null,
                            shippingPostalCode: addr?.postal_code ?? null,
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
                          
                          // Update Purchase with customerId + paymentIntentId
                          ensureDatabaseUrl();
                          await prismaClient.purchase.update({
                            where: { id: createdPurchase.id },
                            data: {
                              customerId: customer.id,
                              paymentIntentId: paymentIntentId || null,
                            },
                          });
                          
                          console.log('[PURCHASE] ✅ linked customer', {
                            purchaseId: createdPurchase.id,
                            customerId: customer.id,
                            paymentIntentId: paymentIntentId || 'none',
                          });
                          
                          // Ensure Fulfillment exists ONLY for physical products (paperback)
                          // Ebooks and audio_preorder don't need fulfillment
                          if (isPhysicalProduct) {
                            ensureDatabaseUrl();
                            await prismaClient.fulfillment.upsert({
                              where: { purchaseId: createdPurchase.id },
                              create: {
                                purchaseId: createdPurchase.id,
                                status: 'PENDING',
                              },
                              update: {},
                            });
                            
                            console.log('[FULFILLMENT] ✅ ensured', {
                              purchaseId: createdPurchase.id,
                              status: 'PENDING',
                              product: product,
                            });
                          } else {
                            console.log('[FULFILLMENT] ⏭️  Skipped (digital product)', {
                              purchaseId: createdPurchase.id,
                              product: product,
                            });
                          }
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
                      // Buyer not found: still create Purchase for debugging/attribution
                      console.log('[PURCHASE] Creating Purchase without buyer', {
                        sessionId: session.id,
                        customerId: customerId || 'none',
                        paymentIntentId: paymentIntentId || 'none',
                      });
                      
                      const purchaseData = {
                        stripeSessionId: session.id,
                        paymentIntentId: paymentIntentId || null,
                        userId: null, // No buyer attributed
                        userCode: contestUserCode || null,
                        customerId: customerId || null,
                        product: product,
                        amountPaidCents: session.amount_total || 0,
                        pointsAwarded: 0, // No points awarded (buyer not found)
                      };
                      
                      createdPurchase = await prismaClient.purchase.create({
                        data: purchaseData,
                      });
                      
                      // ===== STEP 4: LOG SUCCESS =====
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
                            name: name ?? null,
                            phone: phone ?? null,
                            shippingStreet: addr?.line1 ?? null,
                            shippingCity: addr?.city ?? null,
                            shippingState: addr?.state ?? null,
                            shippingPostalCode: addr?.postal_code ?? null,
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
                          
                          // Update Purchase with customerId + paymentIntentId
                          ensureDatabaseUrl();
                          await prismaClient.purchase.update({
                            where: { id: createdPurchase.id },
                            data: {
                              customerId: customer.id,
                              paymentIntentId: paymentIntentId || null,
                            },
                          });
                          
                          console.log('[PURCHASE] ✅ linked customer', {
                            purchaseId: createdPurchase.id,
                            customerId: customer.id,
                            paymentIntentId: paymentIntentId || 'none',
                          });
                          
                          // Ensure Fulfillment exists
                          ensureDatabaseUrl();
                          await prismaClient.fulfillment.upsert({
                            where: { purchaseId: createdPurchase.id },
                            create: {
                              purchaseId: createdPurchase.id,
                              status: 'PENDING',
                            },
                            update: {},
                          });
                          
                          console.log('[FULFILLMENT] ✅ ensured', {
                            purchaseId: createdPurchase.id,
                            status: 'PENDING',
                          });
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
                    
                    // ===== CREATE FULFILLMENT RECORD =====
                    if (createdPurchase) {
                      try {
                        console.log('[FULFILLMENT] Ensuring Fulfillment record', {
                          purchaseId: createdPurchase.id,
                        });
                        
                        ensureDatabaseUrl(); // Ensure before query
                        // Check if fulfillment already exists
                        const existingFulfillment = await prismaClient.fulfillment.findUnique({
                          where: { purchaseId: createdPurchase.id },
                        });
                        
                        if (!existingFulfillment) {
                          ensureDatabaseUrl(); // Ensure before create
                          const fulfillment = await prismaClient.fulfillment.create({
                            data: {
                              purchaseId: createdPurchase.id,
                              status: 'PENDING',
                            },
                          });
                          // ===== STEP 4: LOG SUCCESS =====
                          console.log('[FULFILLMENT] ✅ Fulfillment ensured for purchaseId', {
                            fulfillmentId: fulfillment.id,
                            purchaseId: createdPurchase.id,
                            status: 'PENDING',
                          });
                        } else {
                          console.log('[FULFILLMENT] ✅ Fulfillment already exists', {
                            fulfillmentId: existingFulfillment.id,
                            purchaseId: createdPurchase.id,
                            status: existingFulfillment.status,
                          });
                        }
                      } catch (fulfillmentErr) {
                        // ===== STEP 3: FAIL LOUDLY =====
                        console.error('[FULFILLMENT] ❌ FULFILLMENT WRITE FAILED', {
                          error: fulfillmentErr.message,
                          stack: fulfillmentErr.stack,
                          purchaseId: createdPurchase.id,
                        });
                        // Return 500 so Stripe retries and we see the failure
                        return res.status(500).json({ 
                          error: 'Fulfillment creation failed',
                          details: fulfillmentErr.message 
                        });
                      }
                    } else {
                      console.error('[PURCHASE] ❌ Purchase was not created - cannot create Fulfillment');
                      return res.status(500).json({ 
                        error: 'Purchase creation failed - no purchase record returned' 
                      });
                    }
                  } catch (purchaseErr) {
                    // ===== STEP 3: FAIL LOUDLY =====
                    console.error('[PURCHASE] ❌ PURCHASE WRITE FAILED', {
                      error: purchaseErr.message,
                      stack: purchaseErr.stack,
                      sessionId: session.id,
                      customerId: customerId || 'none',
                    });
                    // Return 500 so Stripe retries and we see the failure
                    return res.status(500).json({ 
                      error: 'Purchase creation failed',
                      details: purchaseErr.message 
                    });
                  }
                }
              } catch (pointsErr) {
                console.error('[ATTRIBUTION_BUYER] Failed to create Purchase record', {
                  error: pointsErr.message,
                  sessionId: session.id,
                  buyerId: buyerUser?.id || 'MISSING',
                  stack: pointsErr.stack,
                });
                // Don't fail webhook - Purchase creation is important but shouldn't block email sending
              }
            } else {
              console.error('[ATTRIBUTION_BUYER] Prisma not available - cannot create Purchase record', {
                sessionId: session.id,
              });
            }

            // Build download URL for eBook purchases (ebook) and free ebook for paperback purchases
            let downloadUrl = null;
            if (product === 'ebook' || product === 'paperback') {
              const siteUrl = envConfig.SITE_URL || 'https://agnes-dev.ngrok-free.app';
              downloadUrl = `${siteUrl}/ebook/download?session_id=${encodeURIComponent(session.id)}`;
            }

            // Send purchase confirmation email
            if (customerEmail) {
              console.log('[WEBHOOK] Starting purchase confirmation email send', {
                sessionId: session.id,
                email: customerEmail,
                product,
                downloadUrl: downloadUrl || 'none',
              });
              
              try {
                const client = getMailchimpClient();
                if (!client) {
                  console.warn('[WEBHOOK] Cannot send purchase email - Mailchimp not configured');
                } else {
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
                  await client.messages.send({
                    message: {
                      from_email: fromEmail,
                      from_name: 'The Agnes Protocol',
                      subject: finalSubject || subject,
                      to: [{ email: customerEmail, type: 'to' }],
                      text: finalText || text,
                      html: finalHtml || html,
                    },
                  });
                  
                  console.log('[WEBHOOK] Purchase confirmation email sent successfully', {
                    sessionId: session.id,
                    email: customerEmail,
                  });
                }
              } catch (emailErr) {
                console.error('[WEBHOOK] Failed to send purchase confirmation email', {
                  error: emailErr.message,
                  stack: emailErr.stack,
                  sessionId: session.id,
                  email: customerEmail,
                });
                // In dev, return non-200 so error is visible
                if (process.env.NODE_ENV === 'development') {
                  return res.status(500).json({ 
                    error: 'Purchase email failed', 
                    details: emailErr.message 
                  });
                }
                // In production, log but don't fail webhook (email is non-critical)
              }
            } else {
              console.warn('[WEBHOOK] Cannot send purchase email - missing customer email', {
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

            // Process referral commission (if referral code present and valid)
            if (ref && refValid && paymentStatus === 'paid') {
              try {
                await processReferralCommission({
                  referrerCode: ref.toUpperCase(),
                  buyerEmail: customerEmail,
                  buyerUserId: buyerUser?.id || null,
                  sessionId: session.id,
                  product: product,
                  amountTotal: session.amount_total || 0,
                  metadata,
                  purchaseId: createdPurchase?.id || existingPurchase?.id || null,
                  purchaseDay: new Date(session.created * 1000),
                });
              } catch (refErr) {
                console.error('[WEBHOOK] Failed to process referral commission', {
                  error: refErr.message,
                  sessionId: session.id,
                  referrerCode: ref,
                });
                // Don't fail webhook - referral commission is non-critical
              }
            } else if (ref && !refValid) {
              console.log('[ATTRIBUTION_REFERRER] Skipping - ref_valid is false', {
                ref,
                ref_valid: refValid,
                sessionId: session.id,
              });
            }
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
const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agnes-dev.ngrok-free.app';
console.log('[WEBHOOK_CONFIG] Webhook endpoint configured:', {
  path: webhookPath,
  fullPath: `${siteUrl}${webhookPath}`,
  note: 'Stripe Dashboard should point to: <your-ngrok-url>/api/stripe/webhook',
  currentSiteUrl: siteUrl,
});

/**
 * Process referral commission: award points, record commission, send email
 * Includes idempotency guard to prevent duplicate processing
 */
async function processReferralCommission({ referrerCode, buyerEmail, buyerUserId, sessionId, product, amountTotal, metadata, purchaseId = null, purchaseDay = null }) {
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
        // Calculate total points and savings from conversions
        try {
          ensureDatabaseUrl(); // Ensure before query
          const conversions = await prismaClient.referralConversion.findMany({
            where: {
              referrerUserId: referrer.id,
            },
            select: {
              savingsCents: true,
            },
          });
          totalPoints = conversions.length * 1000; // 1000 points per conversion
          totalSavingsCents = conversions.reduce((sum, conv) => sum + (conv.savingsCents || 0), 0);
        } catch (pointsErr) {
          console.warn('[WEBHOOK] Failed to count conversions for points/savings', {
            error: pointsErr.message,
          });
          // Use defaults if we can't count
          totalPoints = totalEarningsCents > 0 ? Math.floor(totalEarningsCents / 2) : 0;
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

  // Calculate commission (e.g., $2 = 200 cents)
  const commissionCents = 200; // $2 commission
  
  // Store referral points award result for email template (will be set when points are awarded)
  let referralAwardResult = null;

  // Calculate savings (money saved by buyer due to discount)
  // List prices (in cents): ebook = $12.00 = 1200, paperback = varies, audio_preorder = varies
  const LIST_PRICES = {
    ebook: 1200, // $12.00
    paperback: 2500, // $25.00 (example)
    audio_preorder: 2000, // $20.00 (example)
  };
  
  const productType = product || 'ebook';
  const listPriceCents = LIST_PRICES[productType] || LIST_PRICES.ebook;
  const amountPaidCents = amountTotal || 0;
  const savingsCents = Math.max(0, listPriceCents - amountPaidCents);

  // Record commission (with idempotency)
  if (prismaClient && referrer.id !== 'allowlist-fallback') {
    try {
      ensureDatabaseUrl(); // Ensure before transaction
      await prismaClient.$transaction(async (tx) => {
        // Create referral conversion record (idempotency key: sessionId)
        // Use upsert to make it idempotent - safe to retry webhook events
        await tx.referralConversion.upsert({
          where: { stripeSessionId: sessionId },
          create: {
            referrerCode: normalizedReferrerCode, // Fixed: was referralCode, schema expects referrerCode
            referrerEmail: referrerEmail,
            buyerEmail: normalizeEmail(buyerEmail),
            product: productType,
            stripeSessionId: sessionId,
            commissionCents: commissionCents,
            amountPaidCents: amountPaidCents,
            listPriceCents: listPriceCents,
            savingsCents: savingsCents,
            // ✅ connect via relation (this is what Prisma expects)
            referrer: { connect: { id: referrer.id } },
          },
          update: {
            // If conversion already exists, update it (idempotent retry)
            referrerCode: normalizedReferrerCode,
            referrerEmail: referrerEmail,
            buyerEmail: normalizeEmail(buyerEmail),
            product: productType,
            commissionCents: commissionCents,
            amountPaidCents: amountPaidCents,
            listPriceCents: listPriceCents,
            savingsCents: savingsCents,
            referrer: { connect: { id: referrer.id } },
          },
        });

        // Update referrer earnings (points will be awarded separately via helper)
        await tx.user.update({
          where: { id: referrer.id },
          data: {
            referralEarningsCents: {
              increment: commissionCents,
            },
          },
        });
      });
      
      // Award referral points using guardrails helper (outside transaction)
      referralAwardResult = await awardReferralPoints({
        referrerId: referrer.id,
        referredUserId: buyerUserId || null, // Use buyerUserId from function params
        sku: productType, // ebook, paperback, audio_preorder
        purchaseDay: purchaseDay || new Date(), // Use provided purchase day or current time
        purchaseId: purchaseId || null, // Use provided purchase ID
      });

      console.log('[WEBHOOK] Referral commission recorded', {
        referrerCode: normalizedReferrerCode,
        referrerId: referrer.id,
        commissionCents,
        pointsAwarded: referralAwardResult.awarded,
        reason: referralAwardResult.reason,
        sessionId,
      });
      
      // Fetch updated totals after recording commission
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
        
        // Fetch conversions for total points and savings
        ensureDatabaseUrl(); // Ensure before query
        const conversions = await prismaClient.referralConversion.findMany({
          where: {
            referrerUserId: referrer.id,
          },
          select: {
            savingsCents: true,
          },
        });
        totalPoints = conversions.length * 1000; // 1000 points per conversion
        totalSavingsCents = conversions.reduce((sum, conv) => sum + (conv.savingsCents || 0), 0);
        
        // Structured logging: commission awarded
        console.log('[ATTRIBUTION_REFERRER] Commission awarded', {
          referrerId: referrer.id,
          referrerCode: referrer.referralCode,
          referrerEmail: referrerEmail,
          pointsAwarded: referralAwardResult?.awarded || 0,
          commissionCents: commissionCents,
          savingsCentsThisPurchase: savingsCents,
          savingsCentsTotal: totalSavingsCents,
          totalEarningsCents,
          totalPoints,
        });
      } catch (totalsErr) {
        console.warn('[WEBHOOK] Failed to fetch updated totals', {
          error: totalsErr.message,
        });
        // Use the values we calculated earlier
      }
    } catch (err) {
      // Handle unique constraint violation (idempotency)
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        console.log('[WEBHOOK] Referral commission already recorded (unique constraint)', {
          sessionId,
        });
        // Still fetch totals for email even if already processed
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
          ensureDatabaseUrl(); // Ensure before query
          const conversions = await prismaClient.referralConversion.count({
            where: {
              referrerUserId: referrer.id,
            },
          });
          totalPoints = conversions * 1000;
        } catch (totalsErr) {
          // Ignore - use defaults
        }
        // Don't return - still send email even if already processed
        // Set referralAwardResult to default if not set
        if (!referralAwardResult) {
          referralAwardResult = { awarded: 0, reason: 'already_processed' };
        }
      } else {
        throw err; // Re-throw other errors
      }
    } else {
      // No Prisma - set default award result
      referralAwardResult = { awarded: 0, reason: 'no_prisma' };
    }
  } else {
    // No Prisma or allowlist fallback - set default award result
    referralAwardResult = { awarded: 0, reason: 'no_referrer' };
  }

  // Send referrer commission email (ALWAYS send if referrerEmail exists, regardless of points)
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
        
        const { subject, text, html } = buildReferrerCommissionEmail({
          referrerEmail: referrerEmail,
          referrerCode: normalizedReferrerCode,
          buyerName: buyerDisplayName,
          product: product || 'unknown',
          commissionCents,
          pointsAwarded: referralPointsAwardResult, // Pass full award result
          savingsCents, // Money saved by this buyer
          totalEarningsCents: totalEarningsCents + commissionCents, // Include this commission in total
          totalPoints: totalPoints + referralPointsAwardResult.awarded, // Use actual awarded amount
          totalSavingsCents: totalSavingsCents + savingsCents, // Include this savings in total
        });

        const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
          html,
          text,
          subject,
        });

        await client.messages.send({
          message: {
            from_email: fromEmail,
            from_name: 'The Agnes Protocol',
            subject: finalSubject || subject,
            to: [{ email: referrerEmail, type: 'to' }],
            text: finalText || text,
            html: finalHtml || html,
          },
        });

        console.log('[WEBHOOK] Referrer commission email sent', {
          referrerEmail: referrerEmail,
          referrerCode: normalizedReferrerCode,
          sessionId,
        });
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

