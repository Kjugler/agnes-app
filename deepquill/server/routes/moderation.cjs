// deepquill/server/routes/moderation.cjs
// Admin moderation - approve Signal/Review, award points via canonical Ledger

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { awardForSignalApproved, awardForReviewApproved } = require('../../lib/points/awardPoints.cjs');

const router = express.Router();

function isAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;
  return !!expectedKey && adminKey === expectedKey;
}

// POST /api/admin/moderation/approve-signal
router.post('/admin/moderation/approve-signal', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden - Development only or valid x-admin-key required' });
  }

  try {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid signal id' });
    }

    const updated = await prisma.signal.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        heldAt: null,
        heldReason: null,
      },
      include: { user: { select: { id: true, email: true } } },
    });

    if (updated.userId) {
      try {
        const result = await awardForSignalApproved({ userId: updated.userId, signalId: id });
        if (result.awarded > 0) {
          console.log('[moderation] Points awarded for signal', { signalId: id, userId: updated.userId, awarded: result.awarded });
        }
      } catch (err) {
        console.error('[moderation] Error awarding points for signal', { signalId: id, error: err?.message });
      }
    }

    res.json({
      ok: true,
      signal: { id: updated.id, status: updated.status, approvedAt: updated.approvedAt, userId: updated.userId },
    });
  } catch (err) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Signal not found' });
    }
    console.error('[moderation] Error approving signal', err);
    res.status(500).json({ error: err?.message || 'Failed to approve signal' });
  }
});

// POST /api/admin/moderation/approve-review
router.post('/admin/moderation/approve-review', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden - Development only or valid x-admin-key required' });
  }

  try {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid review id' });
    }

    const updated = await prisma.review.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        heldAt: null,
        heldReason: null,
      },
      include: { user: { select: { id: true, email: true } } },
    });

    if (updated.userId) {
      try {
        const result = await awardForReviewApproved({ userId: updated.userId, reviewId: id });
        if (result.awarded > 0) {
          console.log('[moderation] Points awarded for review', { reviewId: id, userId: updated.userId, awarded: result.awarded });
        }
      } catch (err) {
        console.error('[moderation] Error awarding points for review', { reviewId: id, error: err?.message });
      }
    }

    res.json({
      ok: true,
      review: { id: updated.id, status: updated.status, approvedAt: updated.approvedAt, userId: updated.userId },
    });
  } catch (err) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Review not found' });
    }
    console.error('[moderation] Error approving review', err);
    res.status(500).json({ error: err?.message || 'Failed to approve review' });
  }
});

// POST /api/admin/moderation/approve-all
router.post('/admin/moderation/approve-all', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden - Development only or valid x-admin-key required' });
  }

  try {
    const pendingSignals = await prisma.signal.findMany({
      where: { status: 'HELD' },
      select: { id: true, userId: true },
    });

    const pendingReviews = await prisma.review.findMany({
      where: { status: 'HELD' },
      select: { id: true, userId: true },
    });

    const now = new Date();

    const approvedSignals = await prisma.signal.updateMany({
      where: { id: { in: pendingSignals.map((s) => s.id) } },
      data: { status: 'APPROVED', approvedAt: now, heldAt: null, heldReason: null },
    });

    const approvedReviews = await prisma.review.updateMany({
      where: { id: { in: pendingReviews.map((r) => r.id) } },
      data: { status: 'APPROVED', approvedAt: now, heldAt: null, heldReason: null },
    });

    let signalsAwarded = 0;
    let reviewsAwarded = 0;

    for (const s of pendingSignals) {
      if (s.userId) {
        try {
          const result = await awardForSignalApproved({ userId: s.userId, signalId: s.id });
          if (result.awarded > 0) signalsAwarded++;
        } catch (err) {
          console.warn('[moderation] Error awarding for signal', { signalId: s.id, error: err?.message });
        }
      }
    }

    for (const r of pendingReviews) {
      if (r.userId) {
        try {
          const result = await awardForReviewApproved({ userId: r.userId, reviewId: r.id });
          if (result.awarded > 0) reviewsAwarded++;
        } catch (err) {
          console.warn('[moderation] Error awarding for review', { reviewId: r.id, error: err?.message });
        }
      }
    }

    res.json({
      ok: true,
      approved: { signals: approvedSignals.count, reviews: approvedReviews.count },
      pointsAwarded: { signals: signalsAwarded, reviews: reviewsAwarded },
    });
  } catch (err) {
    console.error('[moderation] Error approving all', err);
    res.status(500).json({ error: err?.message || 'Failed to approve all' });
  }
});

module.exports = router;
