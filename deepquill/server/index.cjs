// deepquill/server/index.cjs
console.log('🟢 Booting deepquill API…');

const path = require('path');
const express = require('express');
const cors = require('cors');

// load env
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });


const app = express();
app.use(cors({ origin: true }));
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

const PORT = 5055;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
