// deepquill/server/index.cjs
console.log('🟢 Booting deepquill API…');

const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

// Load env FIRST (before any other imports that might use env vars)
// Priority: .env.local (highest) > .env > process.env
const envLocalPath = path.join(__dirname, '..', '.env.local');
const envPath = path.join(__dirname, '..', '.env');

// Load .env.local first (highest priority)
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath, override: false });
}

// Then load .env (lower priority, won't override .env.local)
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: false });
}

// Check for SITE_URL conflicts between .env.local and .env
function checkSiteUrlConflict() {
  let envLocalSiteUrl = null;
  let envSiteUrl = null;
  
  if (fs.existsSync(envLocalPath)) {
    const envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
    const match = envLocalContent.match(/^SITE_URL\s*=\s*(.+)$/m);
    if (match) {
      envLocalSiteUrl = match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^SITE_URL\s*=\s*(.+)$/m);
    if (match) {
      envSiteUrl = match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  
  if (envLocalSiteUrl && envSiteUrl && envLocalSiteUrl !== envSiteUrl) {
    console.warn('');
    console.warn('⚠️  [ENV WARNING] .env.local SITE_URL differs from .env SITE_URL');
    console.warn(`   .env.local SITE_URL: ${envLocalSiteUrl}`);
    console.warn(`   .env SITE_URL: ${envSiteUrl}`);
    console.warn('   Using .env.local value (highest priority)');
    console.warn('');
  }
}

checkSiteUrlConflict();

// Log DATABASE_URL truth (DO NO HARM - just logging)
console.log('[BOOT] cwd=', process.cwd());
console.log('[BOOT] DATABASE_URL=', process.env.DATABASE_URL);

// Load and validate env config (will throw if STRIPE_SECRET_KEY is missing/invalid)
let envConfig;
try {
  envConfig = require('../src/config/env.cjs');
} catch (err) {
  console.error('❌ [BOOT] Environment configuration failed:', err.message);
  process.exit(1);
}

// Log environment configuration
console.log(`[ENV] NODE_ENV=${envConfig.NODE_ENV}`);
if (envConfig.SITE_URL) {
  console.log(`[ENV] Resolved SITE_URL=${envConfig.SITE_URL}`);
} else {
  console.warn('[ENV] SITE_URL not configured');
}

// Log Stripe configuration (safe - only shows last 6 chars)
console.log(`[BOOT] Stripe mode=${envConfig.STRIPE_MODE} key=***${envConfig.STRIPE_KEY_FINGERPRINT}`);
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

// Fulfillment API - mount early so /api/fulfillment/* is handled before broad /api routers
const fulfillmentRouter = require('./routes/fulfillment.cjs');
app.use('/api/fulfillment', fulfillmentRouter);
console.log('✅ Mounted /api/fulfillment');

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

// Checkout session verification
const verifySessionHandler = require('../api/checkout/verify-session.cjs');
app.get('/api/checkout/verify-session', verifySessionHandler);
console.log('✅ Mounted /api/checkout/verify-session');

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

// Referrals invite API (new endpoint for agnes-next)
const referralsInviteRouter = require('../api/referrals/invite.cjs');
app.use('/api/referrals', referralsInviteRouter);
console.log('✅ Mounted /api/referrals/invite');

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

// Points award endpoint (for moderation approval)
const pointsAwardHandler = require('../api/points/award.cjs');
app.post('/api/points/award', async (req, res) => {
  await pointsAwardHandler(req, res);
});
console.log('✅ Mounted /api/points/award');

// Signal CRUD (canonical DB owner)
const signalsRouter = require('./routes/signals.cjs');
app.use('/api', signalsRouter);
console.log('✅ Mounted /api signals (signals, signal/create, etc.)');

// Review CRUD (canonical DB owner)
const reviewsRouter = require('./routes/reviews.cjs');
app.use('/api', reviewsRouter);
console.log('✅ Mounted /api reviews (reviews/create, list, summary)');

// Admin moderation (approve Signal/Review, award points via Ledger)
const moderationRouter = require('./routes/moderation.cjs');
app.use('/api', moderationRouter);
console.log('✅ Mounted /api admin/moderation (approve-signal, approve-review, approve-all)');

// Admin jobs (email reminders, seed-signal-room)
const adminJobsRouter = require('./routes/adminJobs.cjs');
app.use('/api/admin/jobs', adminJobsRouter);
console.log(
  '✅ Mounted /api/admin/jobs (send-engaged-reminders, send-non-participant-reminders, send-no-purchase-reminders, send-missionary-emails, seed-signal-room, daily-contest-summary)'
);

// Contest login endpoint (DB owner)
const contestLoginHandler = require('../api/contest/login.cjs');
app.post('/api/contest/login', contestLoginHandler);
console.log('✅ Mounted /api/contest/login');

const contestJoinHandler = require('../api/contest/join.cjs');
app.post('/api/contest/join', contestJoinHandler);
console.log('✅ Mounted /api/contest/join');

const contestExplicitEnterHandler = require('../api/contest/explicitEnter.cjs');
app.post('/api/contest/explicit-enter', contestExplicitEnterHandler);
console.log('✅ Mounted /api/contest/explicit-enter');

// Points endpoint (canonical DB owner)
const pointsMeHandler = require('../api/points/me.cjs');
app.get('/api/points/me', pointsMeHandler);
console.log('✅ Mounted /api/points/me');

// Associate status endpoint (canonical DB owner)
const associateStatusHandler = require('../api/associate/status.cjs');
app.get('/api/associate/status', associateStatusHandler);
console.log('✅ Mounted /api/associate/status');

// Associate upsert endpoint (canonical DB owner)
const associateUpsertHandler = require('../api/associate/upsert.cjs');
app.post('/api/associate/upsert', associateUpsertHandler);
console.log('✅ Mounted /api/associate/upsert');

// Rabbit catch endpoint (canonical - progression + reward)
const rabbitCatchHandler = require('../api/rabbit/catch.cjs');
app.post('/api/rabbit/catch', rabbitCatchHandler);
console.log('✅ Mounted /api/rabbit/catch');

// Contest score endpoint (canonical DB owner)
const contestScoreHandler = require('../api/contest/score.cjs');
app.get('/api/contest/score', contestScoreHandler);
console.log('✅ Mounted /api/contest/score');

// Contest live stats (read-only aggregates for Rock Concert Mode)
const contestLiveStatsHandler = require('../api/contest/liveStats.cjs');
app.get('/api/contest/live-stats', contestLiveStatsHandler);
console.log('✅ Mounted /api/contest/live-stats');

// Daily contest summary (ribbons / bulletin / admin)
const contestDailySummaryHandler = require('../api/contest/daily-summary.cjs');
app.get('/api/contest/daily-summary', contestDailySummaryHandler);
console.log('✅ Mounted /api/contest/daily-summary');

const adminContestDailyRouter = require('./routes/adminContestDaily.cjs');
app.use('/api/admin/contest', adminContestDailyRouter);
console.log('✅ Mounted /api/admin/contest (daily-summary)');

// Terminal discovery bonus (SPEC 3: +250 pts for hidden path discovery)
const contestTerminalDiscoveryHandler = require('../api/contest/terminalDiscovery.cjs');
app.post('/api/contest/terminal-discovery', contestTerminalDiscoveryHandler);
console.log('✅ Mounted /api/contest/terminal-discovery');

// Email delivery status endpoint (canonical DB owner)
const emailDeliveryStatusHandler = require('../api/email/purchase-confirmation-status.cjs');
app.get('/api/email/purchase-confirmation/status', emailDeliveryStatusHandler);
console.log('✅ Mounted /api/email/purchase-confirmation/status');

// Referral code validation endpoint (canonical DB owner)
const validateReferralCodeHandler = require('../api/referral/validate.cjs');
app.get('/api/referral/validate', validateReferralCodeHandler);
app.post('/api/referral/validate', validateReferralCodeHandler);
console.log('✅ Mounted /api/referral/validate');

// Referral email points award endpoint (canonical DB owner)
const awardReferralEmailPointsHandler = require('../api/referral/award-email-points.cjs');
app.post('/api/referral/award-email-points', awardReferralEmailPointsHandler);
console.log('✅ Mounted /api/referral/award-email-points');

// Webhook diagnostic endpoint (check if purchase was processed)
const webhookDiagnosticHandler = require('../api/webhook-diagnostic.cjs');
app.get('/api/webhook-diagnostic', webhookDiagnosticHandler);
console.log('✅ Mounted /api/webhook-diagnostic');

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
  
  // Debug Prisma endpoint (dev only)
  const debugPrisma = require('../api/debug/prisma.cjs');
  app.get('/api/debug/prisma', debugPrisma);
  console.log('✅ Mounted /api/debug/prisma (dev only)');
}

// Railway/Render/Vercel set PORT; fallback for local dev
const PORT = Number(process.env.PORT) || 5055;
// Bind all interfaces so PaaS proxies (Railway) can reach the process (not only loopback)
const HOST = process.env.HOST || '0.0.0.0';

// ✅ Print startup banner before server starts
const { printStartupBanner } = require('../lib/startupBanner.cjs');
printStartupBanner({
  port: PORT,
  host: HOST,
  nodeEnv: envConfig.NODE_ENV,
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server is listening on http://${HOST}:${PORT}`);
});
