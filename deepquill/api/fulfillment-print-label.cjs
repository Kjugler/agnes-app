// deepquill/api/fulfillment-print-label.cjs
// POST /api/admin/fulfillment/print-label
// Body: { purchaseId, fulfillmentUserId }
// Marks that a label was printed (no status change, just tracking)

const express = require('express');
const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');

const router = express.Router();

router.post('/admin/fulfillment/print-label', express.json(), async (req, res) => {
  try {
    ensureDatabaseUrl();
    
    const { purchaseId, fulfillmentUserId } = req.body;
    
    if (!purchaseId || !fulfillmentUserId) {
      return res.status(400).json({ error: 'purchaseId and fulfillmentUserId are required' });
    }
    
    // Find the purchase
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        customer: true,
        fulfillment: true,
      },
    });
    
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    
    // Ensure Fulfillment exists (but don't change status - still PENDING)
    const fulfillment = await prisma.fulfillment.upsert({
      where: { purchaseId: purchase.id },
      update: {
        // No status change - just ensure record exists
        notes: fulfillmentUserId ? `Label printed by user ${fulfillmentUserId}` : null,
      },
      create: {
        purchaseId: purchase.id,
        status: 'PENDING',
        notes: fulfillmentUserId ? `Label printed by user ${fulfillmentUserId}` : null,
      },
    });
    
    return res.json({
      success: true,
      order: {
        id: purchase.id,
        shippingName: purchase.customer?.name || '',
        addressLine1: purchase.customer?.shippingStreet || '',
        addressLine2: null,
        city: purchase.customer?.shippingCity || '',
        state: purchase.customer?.shippingState || '',
        postalCode: purchase.customer?.shippingPostalCode || '',
        country: purchase.customer?.shippingCountry || '',
      },
    });
  } catch (error) {
    console.error('[fulfillment-print-label] Error:', error);
    return res.status(500).json({ error: 'Failed to mark label as printed' });
  }
});

module.exports = router;

