// deepquill/server/routes/fulfillment.cjs
// Canonical fulfillment API - reads/writes Order, Customer, FulfillmentUser via Prisma
// FIFO + reservation: claim at fetch, strict print-label ownership, release-reservation

const express = require('express');
const { fulfillmentPrisma } = require('../prisma.cjs');
const { sendShippingConfirmationEmail } = require('../../lib/email/shippingConfirmation.cjs');
const { requireFulfillmentAuth } = require('../../lib/fulfillmentAuth.cjs');

const RESERVATION_TTL_MS = (parseInt(process.env.FULFILLMENT_RESERVATION_TTL_MINUTES || '30', 10) || 30) * 60 * 1000;
const EARNINGS_PER_BOOK_CENTS = 200; // $2.00 per shipped book

const router = express.Router();

// All fulfillment routes require auth
router.use(requireFulfillmentAuth);

// GET /api/fulfillment/users - List helpers. ?activeOnly=true for picker (id, name, email only)
router.get('/users', async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const where = activeOnly ? { active: true } : {};

    if (activeOnly) {
      const users = await fulfillmentPrisma.fulfillmentUser.findMany({
        where,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true },
      });
      return res.json(users);
    }

    const users = await fulfillmentPrisma.fulfillmentUser.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        shippedOrders: { select: { id: true } },
        payments: { orderBy: { paidAt: 'desc' }, take: 10 },
      },
    });

    const result = users.map((u) => {
      const shippedCount = u.shippedOrders?.length || 0;
      const earnedCents = shippedCount * EARNINGS_PER_BOOK_CENTS;
      const paidCents = (u.payments || []).reduce((sum, p) => sum + p.amountCents, 0);
      const balanceCents = earnedCents - paidCents;
      const recentPayments = (u.payments || []).map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt.toISOString(),
        note: p.note,
      }));
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        active: u.active,
        shippedCount,
        earnedCents,
        paidCents,
        balanceCents,
        recentPayments,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[fulfillment/users] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch helpers' });
  }
});

// GET /api/fulfillment/users/:id - Get helper with payments (for admin detail)
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const user = await fulfillmentPrisma.fulfillmentUser.findUnique({
      where: { id },
      include: {
        shippedOrders: { select: { id: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Helper not found' });
    }

    const shippedCount = user.shippedOrders?.length || 0;
    const earnedCents = shippedCount * EARNINGS_PER_BOOK_CENTS;
    const paidCents = (user.payments || []).reduce((sum, p) => sum + p.amountCents, 0);
    const balanceCents = earnedCents - paidCents;

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
      shippedCount,
      earnedCents,
      paidCents,
      balanceCents,
      payments: (user.payments || []).map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt.toISOString(),
        note: p.note,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[fulfillment/users/:id] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch helper' });
  }
});

// PATCH /api/fulfillment/user/:id - Update helper (active status)
router.patch('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active (boolean) is required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const user = await fulfillmentPrisma.fulfillmentUser.update({
      where: { id },
      data: { active },
    });

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Helper not found' });
    }
    console.error('[fulfillment/user/:id] Error:', err);
    return res.status(500).json({ error: 'Failed to update helper' });
  }
});

// POST /api/fulfillment/payments - Record payment to helper
router.post('/payments', async (req, res) => {
  try {
    const { fulfillmentUserId, amountCents, paidAt, note } = req.body || {};
    if (!fulfillmentUserId || typeof amountCents !== 'number' || amountCents <= 0) {
      return res.status(400).json({ error: 'fulfillmentUserId and amountCents (positive) are required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const payment = await fulfillmentPrisma.fulfillmentPayment.create({
      data: {
        fulfillmentUserId,
        amountCents,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        note: note || null,
      },
    });

    return res.json({
      id: payment.id,
      fulfillmentUserId: payment.fulfillmentUserId,
      amountCents: payment.amountCents,
      paidAt: payment.paidAt.toISOString(),
      note: payment.note,
      createdAt: payment.createdAt.toISOString(),
    });
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(404).json({ error: 'Helper not found' });
    }
    console.error('[fulfillment/payments] Error:', err);
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

// GET /api/fulfillment/next-for-label - Command: atomically claim oldest eligible order (FIFO)
// Requires fulfillmentUserId query param. Returns { order } or { order: null }.
router.get('/next-for-label', async (req, res) => {
  try {
    const fulfillmentUserId = req.query.fulfillmentUserId;
    if (!fulfillmentUserId || typeof fulfillmentUserId !== 'string' || !fulfillmentUserId.trim()) {
      return res.status(400).json({ error: 'fulfillmentUserId is required' });
    }

    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const now = new Date();
    const expiredThreshold = new Date(now.getTime() - RESERVATION_TTL_MS);

    // Atomic claim: find oldest eligible, then update in transaction
    const order = await fulfillmentPrisma.$transaction(async (tx) => {
      const candidate = await tx.order.findFirst({
        where: {
          status: 'pending',
          labelPrintedAt: null,
          shippedAt: null,
          OR: [
            { reservedAt: null },
            { reservedAt: { lt: expiredThreshold } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: { customer: true },
      });

      if (!candidate) return null;

      const updated = await tx.order.update({
        where: { id: candidate.id },
        data: {
          reservedAt: now,
          reservedById: fulfillmentUserId,
        },
        include: { customer: true },
      });
      return updated;
    });

    if (!order) {
      return res.json({ order: null });
    }

    return res.json({
      order: {
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        shippingName: order.shippingName,
        shippingAddressLine1: order.shippingAddressLine1,
        shippingAddressLine2: order.shippingAddressLine2,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingPostalCode: order.shippingPostalCode,
        shippingCountry: order.shippingCountry,
        shippingPhone: order.shippingPhone,
      },
    });
  } catch (err) {
    console.error('[fulfillment/next-for-label] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch next order for label' });
  }
});

// GET /api/fulfillment/to-ship - Read-only: orders printed by user, not yet shipped
router.get('/to-ship', async (req, res) => {
  try {
    const fulfillmentUserId = req.query.fulfillmentUserId;
    if (!fulfillmentUserId) {
      return res.status(400).json({ error: 'fulfillmentUserId is required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const orders = await fulfillmentPrisma.order.findMany({
      where: {
        labelPrintedById: fulfillmentUserId,
        shippedAt: null,
      },
      orderBy: { labelPrintedAt: 'asc' },
    });

    return res.json(
      orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        labelPrintedAt: o.labelPrintedAt?.toISOString() || null,
        shippingName: o.shippingName,
        shippingAddressLine1: o.shippingAddressLine1,
        shippingCity: o.shippingCity,
        shippingState: o.shippingState,
        shippingPostalCode: o.shippingPostalCode,
        shippingCountry: o.shippingCountry,
      }))
    );
  } catch (err) {
    console.error('[fulfillment/to-ship] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders to ship' });
  }
});

// POST /api/fulfillment/print-label - Command: mark label printed
// Strict: only the current reservation owner may print. Expired reservations must be reclaimed via next-for-label.
router.post('/print-label', async (req, res) => {
  try {
    const { orderId, fulfillmentUserId } = req.body || {};
    if (!orderId || !fulfillmentUserId) {
      return res.status(400).json({ error: 'orderId and fulfillmentUserId are required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const order = await fulfillmentPrisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.shippedAt) {
      return res.status(400).json({ error: 'Order has already been shipped' });
    }

    // Strict: only reservation owner may print. No expired-takeover.
    if (order.reservedById !== fulfillmentUserId) {
      return res.status(403).json({
        error: 'Order not reserved for you. Reserve it first via Fetch Next, or it may be reserved by another worker.',
      });
    }
    if (!order.reservedAt) {
      return res.status(403).json({
        error: 'Order reservation missing. Fetch next order to claim it first.',
      });
    }

    const updatedOrder = await fulfillmentPrisma.order.update({
      where: { id: orderId },
      data: {
        reservedAt: null,
        reservedById: null,
        labelPrintedAt: new Date(),
        labelPrintedById: fulfillmentUserId,
        status: 'label_printed',
      },
    });

    return res.json({
      success: true,
      order: {
        id: updatedOrder.id,
        shippingName: updatedOrder.shippingName || '',
        addressLine1: updatedOrder.shippingAddressLine1 || '',
        addressLine2: updatedOrder.shippingAddressLine2,
        city: updatedOrder.shippingCity || '',
        state: updatedOrder.shippingState || '',
        postalCode: updatedOrder.shippingPostalCode || '',
        country: updatedOrder.shippingCountry || '',
      },
    });
  } catch (err) {
    console.error('[fulfillment/print-label] Error:', err);
    return res.status(500).json({ error: 'Failed to mark label as printed' });
  }
});

// POST /api/fulfillment/release-reservation - Command: release order without printing (e.g. Skip / Problem)
router.post('/release-reservation', async (req, res) => {
  try {
    const { orderId, fulfillmentUserId } = req.body || {};
    if (!orderId || !fulfillmentUserId) {
      return res.status(400).json({ error: 'orderId and fulfillmentUserId are required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const order = await fulfillmentPrisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.labelPrintedAt) {
      return res.status(400).json({ error: 'Order already has label printed' });
    }
    if (order.reservedById !== fulfillmentUserId) {
      return res.status(403).json({ error: 'Order not reserved by you. Cannot release.' });
    }

    await fulfillmentPrisma.order.update({
      where: { id: orderId },
      data: {
        reservedAt: null,
        reservedById: null,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[fulfillment/release-reservation] Error:', err);
    return res.status(500).json({ error: 'Failed to release reservation' });
  }
});

// POST /api/fulfillment/mark-shipped - Command: mark shipped + send confirmation email
router.post('/mark-shipped', async (req, res) => {
  try {
    const { orderId, fulfillmentUserId } = req.body || {};
    if (!orderId || !fulfillmentUserId) {
      return res.status(400).json({ error: 'orderId and fulfillmentUserId are required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const order = await fulfillmentPrisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await fulfillmentPrisma.order.update({
      where: { id: orderId },
      data: {
        shippedAt: new Date(),
        shippedById: fulfillmentUserId,
        status: 'shipped',
      },
    });

    const customerEmail = order.customer.email;
    const shippingName = order.shippingName || order.customer.name || 'there';

    await sendShippingConfirmationEmail({
      toEmail: customerEmail,
      shippingName,
      orderId: order.id,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[fulfillment/mark-shipped] Error:', err);
    return res.status(500).json({ error: 'Failed to mark order as shipped' });
  }
});

// POST /api/fulfillment/user - Command: upsert FulfillmentUser
router.post('/user', async (req, res) => {
  try {
    const { name, email } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    if (!fulfillmentPrisma) {
      return res.status(503).json({ error: 'Fulfillment database not available' });
    }

    const fulfillmentUser = await fulfillmentPrisma.fulfillmentUser.upsert({
      where: { email },
      update: { name },
      create: { name, email, active: true },
    });

    return res.json({
      id: fulfillmentUser.id,
      name: fulfillmentUser.name,
      email: fulfillmentUser.email,
      active: fulfillmentUser.active,
    });
  } catch (err) {
    console.error('[fulfillment/user] Error:', err);
    return res.status(500).json({ error: 'Failed to create/update fulfillment user' });
  }
});

module.exports = router;
