// deepquill/api/fulfillment-queue.cjs
// GET /api/admin/fulfillment/queue?limit=5
// Returns next N paperback purchases ready to ship

const express = require('express');
const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');

const router = express.Router();

router.get('/admin/fulfillment/queue', async (req, res) => {
  try {
    ensureDatabaseUrl();
    
    const limit = parseInt(req.query.limit || '5', 10);
    
    // Find purchases where:
    // - product = "paperback"
    // - Fulfillment.status = "PENDING" OR Fulfillment is missing
    // - Customer exists (has shipping address)
    const purchases = await prisma.purchase.findMany({
      where: {
        product: 'paperback',
        customerId: { not: null }, // Must have customer with shipping info
        OR: [
          { fulfillment: null }, // No fulfillment record yet
          { fulfillment: { status: 'PENDING' } }, // Fulfillment exists but not shipped
        ],
      },
      include: {
        customer: true,
        fulfillment: true,
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
      take: limit,
    });
    
    const orders = purchases.map((p) => ({
      id: p.id,
      purchaseId: p.id,
      stripeSessionId: p.stripeSessionId,
      createdAt: p.createdAt.toISOString(),
      shippingName: p.customer?.name || null,
      shippingAddressLine1: p.customer?.shippingStreet || null,
      shippingCity: p.customer?.shippingCity || null,
      shippingState: p.customer?.shippingState || null,
      shippingPostalCode: p.customer?.shippingPostalCode || null,
      shippingCountry: p.customer?.shippingCountry || null,
      shippingPhone: p.customer?.phone || null,
      customerEmail: p.customer?.email || null,
      labelPrintedAt: p.fulfillment?.shippedAt ? null : null, // Not tracking label print separately
      fulfillmentStatus: p.fulfillment?.status || 'PENDING',
    }));
    
    return res.json(orders);
  } catch (error) {
    console.error('[fulfillment-queue] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch fulfillment queue' });
  }
});

module.exports = router;

