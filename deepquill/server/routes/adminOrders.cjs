// deepquill/server/routes/adminOrders.cjs
const express = require('express');
const { generateShippingLabel } = require('../../lib/generateShippingLabel.cjs');
const { getOrderById } = require('../../lib/ordersStore.cjs');

const router = express.Router();

router.get('/api/admin/orders/:id/label', async (req, res) => {
  try {
    const { id } = req.params;
    const order = getOrderById(id);

    if (!order) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }

    generateShippingLabel(res, order);
  } catch (err) {
    console.error('[ADMIN-ORDERS] Failed to generate label', { orderId: req.params.id, error: err });
    res.status(500).json({ ok: false, error: 'Failed to generate label' });
  }
});

module.exports = router;

