// deepquill/api/stripe-webhook.cjs
// Stripe webhook handler - verifies signatures and processes events

const express = require('express');
const mailchimp = require('@mailchimp/mailchimp_transactional');
const { stripe } = require('../src/lib/stripe.cjs');
const { STRIPE_WEBHOOK_SECRET } = require('../src/config/env.cjs');
const { logFulfillment } = require('../src/lib/fulfillmentLogger.cjs');
const { buildPurchaseConfirmationEmail } = require('../src/lib/purchaseEmail.cjs');
const { applyGlobalEmailBanner } = require('../src/lib/emailBanner.cjs');

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
          
          const paymentStatus = session.payment_status;
          const metadata = session.metadata || {};
          
          console.log('[WEBHOOK] checkout.session.completed', {
            sessionId: session.id,
            customerEmail: customerEmail || '(not provided)',
            paymentStatus,
            amountTotal: session.amount_total,
            currency: session.currency,
            product: metadata.product,
          });

          // Only process if payment succeeded
          if (paymentStatus === 'paid') {
            const product = metadata.product;
            const paymentIntentId = typeof session.payment_intent === 'string' 
              ? session.payment_intent 
              : session.payment_intent?.id || null;

            // Send purchase confirmation email
            if (customerEmail) {
              console.log('[WEBHOOK] Starting purchase confirmation email send', {
                sessionId: session.id,
                email: customerEmail,
                product,
              });
              
              try {
                const client = getMailchimpClient();
                if (!client) {
                  console.warn('[WEBHOOK] Cannot send purchase email - Mailchimp not configured');
                } else {
                  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
                  
                  // Build purchase confirmation email
                  const { subject, text, html } = buildPurchaseConfirmationEmail({
                    email: customerEmail,
                    sessionId: session.id,
                    product: product || 'unknown',
                    amountTotal: session.amount_total || 0,
                    currency: session.currency || 'usd',
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
          }

          // TODO: Process purchase, award points, send emails, etc.
          // This should be implemented to:
          // 1. Create/update Order record in Prisma
          // 2. Award buyer points (+500)
          // 3. Award associate rewards if ref was used (+1000 points, +$2 payout)
          // 4. Send order confirmation email
          // 5. Send associate commission email if applicable
          
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

      // Return 200 quickly to acknowledge receipt
      return res.status(200).json({ received: true, eventType: event.type });
    } catch (err) {
      console.error('[WEBHOOK] Unexpected error:', err.message, err.stack);
      return res.status(500).json({ error: 'Webhook processing error' });
    }
  }
);

module.exports = router;

