// deepquill/api/fulfillment-next-label.cjs
// GET /api/admin/fulfillment/next-label
// Returns the oldest paperback purchase ready for label printing

const express = require('express');
const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');

const router = express.Router();

router.get('/admin/fulfillment/next-label', async (req, res) => {
  try {
    ensureDatabaseUrl();
    
    // Find the oldest purchase where:
    // - product = "paperback"
    // - Fulfillment.status = "PENDING" OR Fulfillment is missing
    // - Customer exists (has shipping address)
    const purchase = await prisma.purchase.findFirst({
      where: {
        product: 'paperback',
        customerId: { not: null },
        OR: [
          { fulfillment: null },
          { fulfillment: { status: 'PENDING' } },
        ],
      },
      include: {
        customer: true,
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
    });
    
    if (!purchase) {
      return res.json({ order: null });
    }
    
    return res.json({
      order: {
        id: purchase.id,
        purchaseId: purchase.id,
        createdAt: purchase.createdAt.toISOString(),
        shippingName: purchase.customer?.name || null,
        shippingAddressLine1: purchase.customer?.shippingStreet || null,
        shippingAddressLine2: null, // Not stored separately
        shippingCity: purchase.customer?.shippingCity || null,
        shippingState: purchase.customer?.shippingState || null,
        shippingPostalCode: purchase.customer?.shippingPostalCode || null,
        shippingCountry: purchase.customer?.shippingCountry || null,
        shippingPhone: purchase.customer?.phone || null,
        customerEmail: purchase.customer?.email || null,
      },
    });
  } catch (error) {
    console.error('[fulfillment-next-label] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch next order for label' });
  }
});

module.exports = router;

