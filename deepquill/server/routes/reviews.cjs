// deepquill/server/routes/reviews.cjs
// Review CRUD - canonical DB owner

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { resolveUserByEmail } = require('../../lib/resolveUser.cjs');
const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');

const router = express.Router();

const PROFANITY_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'faggot'];

function containsLink(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return lower.includes('http://') || lower.includes('https://') || lower.includes('www.') || lower.includes('.com') || lower.includes('@');
}

function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return PROFANITY_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower));
}

// POST /api/reviews/create
router.post('/reviews/create', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const body = req.body || {};
    const ratingRaw = body.rating;
    const rating = typeof ratingRaw === 'number' ? Math.round(ratingRaw) : Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, error: 'rating must be 1-5' });
    }

    const textRaw = body.text;
    if (typeof textRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'text must be a string' });
    }
    const text = textRaw.trim();
    if (text.length < 3 || text.length > 240) {
      return res.status(400).json({ ok: false, error: 'text must be 3-240 characters' });
    }

    let tags = null;
    if (body.tags) {
      if (Array.isArray(body.tags) && body.tags.length > 0 && body.tags.length <= 5) {
        tags = JSON.stringify(body.tags.slice(0, 5));
      } else {
        return res.status(400).json({ ok: false, error: 'tags must be an array with 1-5 items' });
      }
    }

    const purchaseCount = await prisma.purchase.count({ where: { userId: user.id } });
    const conversions = await prisma.referralConversion.findMany({
      where: { buyerEmail: user.email },
      select: { id: true },
    });
    const hasPurchase = purchaseCount > 0 || conversions.length > 0;

    const rollup = await getPointsRollupForUser(prisma, user.id);
    const isContestOfficial = (rollup?.totalPoints || 0) >= 250;

    const hasLink = containsLink(text);
    const hasProfanity = containsProfanity(text);
    let status = 'HELD';
    let heldReason = null; // Prisma ReviewHeldReason enum: PROFANITY, LINK, etc.

    if (hasPurchase || isContestOfficial) status = 'APPROVED';
    if (hasLink) {
      status = 'HELD';
      heldReason = 'LINK';
    } else if (hasProfanity) {
      status = 'HELD';
      heldReason = 'PROFANITY';
    }

    const AUTO_APPROVE = process.env.NODE_ENV === 'development' && process.env.AUTO_APPROVE_USER_CONTENT === 'true';
    if (AUTO_APPROVE && status === 'HELD') {
      status = 'APPROVED';
      heldReason = null;
    }

    const countryCode = req.headers['x-vercel-ip-country'] || null;
    const region = req.headers['x-vercel-ip-country-region'] || null;

    const review = await prisma.review.upsert({
      where: { userId: user.id },
      update: {
        rating,
        text,
        tags,
        status,
        heldReason,
        countryCode,
        region,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        heldAt: status === 'HELD' ? new Date() : null,
      },
      create: {
        userId: user.id,
        rating,
        text,
        tags,
        status,
        heldReason,
        countryCode,
        region,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        heldAt: status === 'HELD' ? new Date() : null,
      },
    });

    res.json({ ok: true, status, reviewId: review.id });
  } catch (err) {
    console.error('[reviews/create] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/reviews/list
router.get('/reviews/list', async (req, res) => {
  try {
    const takeParam = req.query.take;
    const take = takeParam ? Math.min(parseInt(takeParam, 10), 100) : 50;
    const currentUser = await resolveUserByEmail(req);

    const reviews = await prisma.review.findMany({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { email: true, firstName: true } },
      },
    });

    const reviewsData = reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      tags: r.tags ? (typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags) : null,
      createdAt: r.createdAt,
      userEmail: r.user?.email,
      userFirstName: r.user?.firstName,
      isAuthor: !!(currentUser && r.userId === currentUser.id),
    }));

    res.json({ ok: true, reviews: reviewsData });
  } catch (err) {
    console.error('[reviews/list] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/reviews/summary
router.get('/reviews/summary', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { status: 'APPROVED' },
      select: { rating: true },
    });

    const count = reviews.length;
    const isStable = count >= 5;

    if (count === 0) {
      return res.json({
        ok: true,
        count: 0,
        isStable: false,
        average: null,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = isStable ? sum / count : null;
    const distribution = {
      1: reviews.filter((r) => r.rating === 1).length,
      2: reviews.filter((r) => r.rating === 2).length,
      3: reviews.filter((r) => r.rating === 3).length,
      4: reviews.filter((r) => r.rating === 4).length,
      5: reviews.filter((r) => r.rating === 5).length,
    };

    res.json({
      ok: true,
      count,
      isStable,
      average: average != null ? Math.round(average * 10) / 10 : null,
      distribution,
    });
  } catch (err) {
    console.error('[reviews/summary] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// PATCH /api/review/:id - Author self-service update
router.patch('/review/:id', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const id = req.params.id;
    const existing = await prisma.review.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Review not found' });
    if (existing.userId !== user.id) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    if (existing.status !== 'APPROVED') return res.status(400).json({ ok: false, error: 'Review not approved' });

    const body = req.body || {};
    const updates = {};

    const ratingRaw = body.rating;
    const rating = typeof ratingRaw === 'number' ? Math.round(ratingRaw) : Number(ratingRaw);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) updates.rating = rating;

    const textRaw = body.text;
    if (typeof textRaw === 'string') {
      const text = textRaw.trim();
      if (text.length >= 3 && text.length <= 240) updates.text = text;
    }

    if (body.tags !== undefined) {
      if (Array.isArray(body.tags) && body.tags.length > 0 && body.tags.length <= 5 && body.tags.every((t) => typeof t === 'string')) {
        updates.tags = JSON.stringify(body.tags.slice(0, 5));
      } else if (body.tags === null) {
        updates.tags = null;
      }
    }

    if (Object.keys(updates).length === 0) return res.json({ ok: true });

    const review = await prisma.review.update({ where: { id }, data: updates });
    res.json({ ok: true, review });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ ok: false, error: 'Review not found' });
    console.error('[review] PATCH error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// DELETE /api/review/:id - Author self-service delete
router.delete('/review/:id', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const id = req.params.id;
    const existing = await prisma.review.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Review not found' });
    if (existing.userId !== user.id) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    await prisma.review.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ ok: false, error: 'Review not found' });
    console.error('[review] DELETE error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

module.exports = router;
