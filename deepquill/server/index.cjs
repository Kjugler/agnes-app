// deepquill/server/index.cjs
console.log('🟢 Booting deepquill API…');

const path = require('path');
const express = require('express');
const cors = require('cors');

// Load env FIRST (before any other imports that might use env vars)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

// Load and validate env config (will throw if STRIPE_SECRET_KEY is missing/invalid)
let envConfig;
try {
  envConfig = require('../src/config/env.cjs');
} catch (err) {
  console.error('❌ [BOOT] Environment configuration failed:', err.message);
  process.exit(1);
}

// Log Stripe configuration (safe - only shows last 6 chars)
console.log(`[BOOT] Stripe mode=${envConfig.STRIPE_MODE} key=***${envConfig.STRIPE_KEY_FINGERPRINT} NODE_ENV=${envConfig.NODE_ENV}`);
if (envConfig.STRIPE_WEBHOOK_SECRET) {
  console.log(`[BOOT] Stripe webhook secret configured (${envConfig.STRIPE_WEBHOOK_SECRET.substring(0, 10)}...)`);
} else {
  console.warn('[BOOT] ⚠️  STRIPE_WEBHOOK_SECRET not configured - webhook signature verification will fail');
}

// Validate price IDs exist in current Stripe mode (dev only, non-blocking)
if (envConfig.DEBUG && envConfig.STRIPE_MODE === 'test') {
  const { stripe } = require('../src/lib/stripe.cjs');
  const pricesToCheck = [
    { name: 'paperback', id: envConfig.STRIPE_PRICE_PAPERBACK },
    { name: 'ebook', id: envConfig.STRIPE_PRICE_EBOOK },
    { name: 'audio_preorder', id: envConfig.STRIPE_PRICE_AUDIO_PREORDER },
  ];

  Promise.all(
    pricesToCheck
      .filter((p) => p.id)
      .map(async (p) => {
        try {
          await stripe.prices.retrieve(p.id);
          console.log(`[BOOT] ✅ Price ${p.name} (${p.id}) exists in ${envConfig.STRIPE_MODE} mode`);
        } catch (err) {
          console.error(`[BOOT] ❌ Price ${p.name} (${p.id}) not found in ${envConfig.STRIPE_MODE} mode:`, err.message);
        }
      })
  ).catch(() => {
    // Non-blocking - don't fail startup if price check fails
  });
}


const app = express();
app.use(cors({ origin: true }));

// IMPORTANT: Stripe webhook route MUST be mounted before express.json()
// because it needs raw body bytes for signature verification
const stripeWebhookRouter = require('../api/stripe-webhook.cjs');
app.use('/api', stripeWebhookRouter);
console.log('✅ Mounted /api/stripe/webhook (raw body handler)');

// JSON middleware for all other routes
app.use(express.json());

// health check
app.get('/ping', (req, res) => res.send('pong'));

// --- DEV HARD OVERRIDE: always succeed on POST /api/subscribe (temporary) ---
app.post('/api/subscribe', (req, res) => {
  console.log('🔥 DEV HIT /api/subscribe', req.body);
  return res.json({ ok: true, status: 'dev', message: 'Access Granted! (dev mode)' });
});
// ---------------------------------------------------------------------------

// (keep this block; it won't be reached while the dev override is present)
const subscribeModule = require('../api/subscribe.cjs');
if (subscribeModule && typeof subscribeModule.use === 'function') {
  app.use('/api/subscribe', subscribeModule);
  console.log('✅ Mounted /api/subscribe (router)');
} else if (typeof subscribeModule === 'function') {
  app.post('/api/subscribe', subscribeModule);
  console.log('✅ Mounted /api/subscribe (handler)');
} else {
  console.warn('⚠️ subscribe.cjs export not recognized');
}
console.log("MAILCHIMP_SERVER_PREFIX:", process.env.MAILCHIMP_SERVER_PREFIX ? "loaded" : "missing");
console.log("MAILCHIMP_API_KEY:", process.env.MAILCHIMP_API_KEY ? "loaded" : "missing");
console.log("MAILCHIMP_TRANSACTIONAL_KEY:", process.env.MAILCHIMP_TRANSACTIONAL_KEY ? "loaded" : "missing");
console.log("MAILCHIMP_LIST_ID:", process.env.MAILCHIMP_LIST_ID ? "loaded" : "missing");
console.log("MAILCHIMP_FROM_EMAIL:", process.env.MAILCHIMP_FROM_EMAIL ? "loaded" : "missing");

// Checkout (function handler)
const checkoutHandler = require('../api/create-checkout-session.cjs');
app.post('/api/create-checkout-session', checkoutHandler);

// Referrals API
const referralsRouter = require('../api/award-referral-commission.cjs');
app.use('/api/referrals', referralsRouter);
console.log('✅ Mounted /api/referrals');

// Admin API (daily digests)
const adminDigestsRouter = require('../api/send-daily-digests.cjs');
app.use('/admin/referrals', adminDigestsRouter);
console.log('✅ Mounted /admin/referrals');

// Refer-friend API
const referFriendRouter = require('./routes/referFriend.cjs');
app.use('/api/refer-friend', referFriendRouter);
console.log('✅ Mounted /api/refer-friend');

// Orders API (create orders from Stripe)
const ordersRouter = require('./routes/orders.cjs');
app.use(ordersRouter);
console.log('✅ Mounted /api/orders');

// Admin Orders API (shipping labels)
const adminOrdersRouter = require('./routes/adminOrders.cjs');
app.use(adminOrdersRouter);
console.log('✅ Mounted /api/admin/orders');

// eBook download endpoint (secure token-based)
const ebookDownloadRouter = require('../api/ebook-download.cjs');
app.use('/api', ebookDownloadRouter);
console.log('✅ Mounted /api/ebook/download');

// Debug endpoint (dev only)
if (envConfig.DEBUG) {
  app.get('/api/debug/env', (req, res) => {
    res.json({
      stripeMode: envConfig.STRIPE_MODE,
      stripeKeyLast6: envConfig.STRIPE_KEY_FINGERPRINT,
      nodeEnv: envConfig.NODE_ENV,
      hasPaperbackPrice: !!envConfig.STRIPE_PRICE_PAPERBACK,
      hasEbookPrice: !!envConfig.STRIPE_PRICE_EBOOK,
      hasAudioPreorderPrice: !!envConfig.STRIPE_PRICE_AUDIO_PREORDER,
      hasAssociateCoupon: !!envConfig.STRIPE_ASSOCIATE_15_COUPON_ID,
      associateAllowlistCount: envConfig.ASSOCIATE_REF_ALLOWLIST.length,
      associateAllowlistMode: envConfig.ASSOCIATE_REF_ALLOWLIST_MODE,
    });
  });
  console.log('✅ Mounted /api/debug/env (dev only)');
}

const PORT = 5055;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
