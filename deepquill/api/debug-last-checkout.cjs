// deepquill/api/debug-last-checkout.cjs
// Dev-only endpoint to inspect last checkout attribution

const express = require('express');
const router = express.Router();

// Use single Prisma singleton with explicit datasourceUrl
const { prisma } = require('../server/prisma.cjs');

router.get('/debug/last-checkout', async (req, res) => {
  // Dev-only endpoint
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!prisma) {
    return res.status(500).json({ error: 'Prisma not available' });
  }

  try {
    // Get last purchase
    const lastPurchase = await prisma.purchase.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            code: true,
            referralCode: true,
            points: true,
          },
        },
      },
    }).catch(() => null);

    // Get last referral conversion
    const lastConversion = await prisma.referralConversion.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        referrer: {
          select: {
            id: true,
            email: true,
            referralCode: true,
            referralEarningsCents: true,
          },
        },
      },
    }).catch(() => null);

    return res.json({
      lastPurchase: lastPurchase ? {
        sessionId: lastPurchase.stripeSessionId,
        contestUserId: lastPurchase.userId,
        contestUserCode: lastPurchase.userCode,
        product: lastPurchase.product,
        amountPaidCents: lastPurchase.amountPaidCents,
        pointsAwarded: lastPurchase.pointsAwarded,
        createdAt: lastPurchase.createdAt,
        buyer: lastPurchase.user ? {
          id: lastPurchase.user.id,
          email: lastPurchase.user.email,
          code: lastPurchase.user.code,
          referralCode: lastPurchase.user.referralCode,
          points: lastPurchase.user.points,
        } : null,
      } : null,
      lastConversion: lastConversion ? {
        sessionId: lastConversion.stripeSessionId,
        referrerId: lastConversion.referrerUserId,
        referrerCode: lastConversion.referrerCode,
        buyerEmail: lastConversion.buyerEmail,
        product: lastConversion.product,
        commissionCents: lastConversion.commissionCents,
        amountPaidCents: lastConversion.amountPaidCents,
        listPriceCents: lastConversion.listPriceCents,
        savingsCents: lastConversion.savingsCents,
        createdAt: lastConversion.createdAt,
        referrer: lastConversion.referrer ? {
          id: lastConversion.referrer.id,
          email: lastConversion.referrer.email,
          referralCode: lastConversion.referrer.referralCode,
          referralEarningsCents: lastConversion.referrer.referralEarningsCents,
        } : null,
      } : null,
    });
  } catch (err) {
    console.error('[DEBUG] Error fetching last checkout:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

