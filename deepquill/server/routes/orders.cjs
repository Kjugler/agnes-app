// deepquill/server/routes/orders.cjs
const express = require('express');
const { createOrderFromStripeSession } = require('../../lib/ordersStore.cjs');

const router = express.Router();

// POST /api/orders/create-from-stripe
// Called from agnes-next Stripe webhook handler
router.post('/api/orders/create-from-stripe', async (req, res) => {
  try {
    const session = req.body;
    
    if (!session || !session.id) {
      return res.status(400).json({ ok: false, error: 'Invalid session data' });
    }

    const order = createOrderFromStripeSession(session);

    console.log('[ORDERS] Created order from Stripe session', {
      orderId: order.id,
      stripeSessionId: session.id,
      email: order.email,
    });

    return res.json({ ok: true, order });
  } catch (err) {
    console.error('[ORDERS] Error creating order from Stripe session:', err);
    // Don't block webhook processing - return 200 so Stripe doesn't retry
    return res.status(200).json({ ok: false, error: err.message });
  }
});

module.exports = router;

