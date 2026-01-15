// deepquill/api/fulfillment-mark-shipped.cjs
// POST /api/admin/fulfillment/mark-shipped
// Body: { purchaseId, fulfillmentUserId, carrier, trackingNumber, notes }

const express = require('express');
const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');

const router = express.Router();

router.post('/admin/fulfillment/mark-shipped', express.json(), async (req, res) => {
  try {
    ensureDatabaseUrl();
    
    const { purchaseId, fulfillmentUserId, carrier, trackingNumber, notes } = req.body;
    
    if (!purchaseId) {
      return res.status(400).json({ error: 'purchaseId is required' });
    }
    
    if (!fulfillmentUserId) {
      return res.status(400).json({ error: 'fulfillmentUserId is required' });
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
    
    if (purchase.product !== 'paperback') {
      return res.status(400).json({ error: 'Only paperback purchases can be marked as shipped' });
    }
    
    // Update or create Fulfillment record
    const fulfillment = await prisma.fulfillment.upsert({
      where: { purchaseId: purchase.id },
      update: {
        status: 'SHIPPED',
        shippedAt: new Date(),
        carrier: carrier || null,
        trackingNumber: trackingNumber || null,
        notes: notes || null,
      },
      create: {
        purchaseId: purchase.id,
        status: 'SHIPPED',
        shippedAt: new Date(),
        carrier: carrier || null,
        trackingNumber: trackingNumber || null,
        notes: notes || null,
      },
    });
    
    // Create Payout record for fulfillment worker ($2 per paperback)
    const FULFILLMENT_COMMISSION_CENTS = 200; // $2.00
    
    await prisma.payout.create({
      data: {
        userId: fulfillmentUserId,
        amountCents: FULFILLMENT_COMMISSION_CENTS,
        status: 'PENDING',
        method: 'FULFILLMENT_COMMISSION',
        externalRef: purchase.id,
      },
    });
    
    console.log('[fulfillment-mark-shipped] Purchase marked as shipped', {
      purchaseId: purchase.id,
      fulfillmentUserId,
      carrier,
      trackingNumber,
      payoutCreated: true,
      payoutAmountCents: FULFILLMENT_COMMISSION_CENTS,
    });
    
    return res.json({
      success: true,
      fulfillment: {
        id: fulfillment.id,
        status: fulfillment.status,
        shippedAt: fulfillment.shippedAt,
        carrier: fulfillment.carrier,
        trackingNumber: fulfillment.trackingNumber,
      },
      payoutCreated: true,
      payoutAmountCents: FULFILLMENT_COMMISSION_CENTS,
    });
  } catch (error) {
    console.error('[fulfillment-mark-shipped] Error:', error);
    return res.status(500).json({ error: 'Failed to mark purchase as shipped' });
  }
});

module.exports = router;

