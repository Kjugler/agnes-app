// deepquill/server/index.cjs
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env first (at the very top, before any other requires)
// Use __dirname to always resolve relative to this file's location (cannot be confused)
const ROOT = path.resolve(__dirname, '..'); // deepquill/
const ENV_PATH = path.join(ROOT, '.env');
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local');

console.log('[BOOT-ENV] cwd =', process.cwd());
console.log('[BOOT-ENV] root =', ROOT);
console.log('[BOOT-ENV] .env =', ENV_PATH, 'exists?', fs.existsSync(ENV_PATH));
console.log('[BOOT-ENV] .env.local =', ENV_LOCAL_PATH, 'exists?', fs.existsSync(ENV_LOCAL_PATH));

const r1 = dotenv.config({ path: ENV_PATH });
console.log('[BOOT-ENV] dotenv .env loaded?', !r1.error, 'keys:', r1.parsed ? Object.keys(r1.parsed).length : 0);

const r2 = dotenv.config({ path: ENV_LOCAL_PATH, override: true });
console.log('[BOOT-ENV] dotenv .env.local loaded?', !r2.error, 'keys:', r2.parsed ? Object.keys(r2.parsed).length : 0);

// Ensure DATABASE_URL is set for Prisma (even if not in .env)
// This prevents the adapter from trying to read undefined
if (!process.env.DATABASE_URL) {
  const dbPath = path.join(ROOT, 'dev.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
  console.log('[BOOT-ENV] Set DATABASE_URL fallback:', process.env.DATABASE_URL);
} else {
  console.log('[BOOT-ENV] DATABASE_URL already set:', process.env.DATABASE_URL.substring(0, 30) + '...');
}

console.log('[BOOT-ENV] STRIPE_SECRET_KEY present?', !!process.env.STRIPE_SECRET_KEY);
console.log('[BOOT-ENV] STRIPE_WEBHOOK_SECRET present?', !!process.env.STRIPE_WEBHOOK_SECRET);

console.log('🟢 Booting deepquill API…');

const express = require('express');
const cors = require('cors');

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

// Fulfillment admin routes
const fulfillmentQueueRouter = require('../api/fulfillment-queue.cjs');
app.use('/api', fulfillmentQueueRouter);
console.log('✅ Mounted /api/admin/fulfillment/queue');

const fulfillmentMarkShippedRouter = require('../api/fulfillment-mark-shipped.cjs');
app.use('/api', fulfillmentMarkShippedRouter);
console.log('✅ Mounted /api/admin/fulfillment/mark-shipped');

const fulfillmentNextLabelRouter = require('../api/fulfillment-next-label.cjs');
app.use('/api', fulfillmentNextLabelRouter);
console.log('✅ Mounted /api/admin/fulfillment/next-label');

const fulfillmentPrintLabelRouter = require('../api/fulfillment-print-label.cjs');
app.use('/api', fulfillmentPrintLabelRouter);
console.log('✅ Mounted /api/admin/fulfillment/print-label');

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

// Stripe session retrieval (for agnes-next finalize route)
const stripeSessionHandler = require('../api/stripe-session.cjs');
app.post('/api/stripe/session', stripeSessionHandler);
console.log('✅ Mounted /api/stripe/session');

// eBook download endpoint
const ebookDownloadRouter = require('../api/ebook-download.cjs');
app.use('/api/ebook', ebookDownloadRouter);
console.log('✅ Mounted /api/ebook/download');

// Debug endpoints (dev only)
const debugLastCheckoutRouter = require('../api/debug-last-checkout.cjs');
app.use('/api', debugLastCheckoutRouter);
console.log('✅ Mounted /api/debug/last-checkout (dev only)');

const prismaHealthRouter = require('../api/debug/prisma-health.cjs');
app.use('/api/debug', prismaHealthRouter);
console.log('✅ Mounted /api/debug/prisma-health (dev only)');

// Referrals API
const referralsRouter = require('../api/award-referral-commission.cjs');
app.use('/api/referrals', referralsRouter);
console.log('✅ Mounted /api/referrals');

// Referral email endpoint (proxied from agnes-next)
const referralEmailRouter = require('../api/referral-email.cjs');
app.use('/api/referral-email', referralEmailRouter);
console.log('✅ Mounted /api/referral-email');

// Admin API (daily digests)
const adminDigestsRouter = require('../api/send-daily-digests.cjs');
app.use('/admin/referrals', adminDigestsRouter);
console.log('✅ Mounted /admin/referrals');

// Debug variant logging route
const debugVariantRouter = require('./routes/debugVariant.cjs');
app.post('/api/debug/variant', debugVariantRouter);
console.log('✅ Mounted /api/debug/variant');

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
