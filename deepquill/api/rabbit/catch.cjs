// deepquill/api/rabbit/catch.cjs
// Canonical rabbit catch - awards points when target reached, advances progression

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureRabbitState, calcNextRankThreshold, calcInitialRabbitTarget } = require('../../lib/rabbit.cjs');
const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');

const BONUS_POINTS = 500;

async function handleRabbitCatch(req, res) {
  try {
    // Resolve user identity
    const cookieHeader = req.headers.cookie || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    const headerEmail = req.headers['x-user-email'];
    const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
    const cookieEmail = contestEmailMatch?.[1] || userEmailMatch?.[1];

    let userId = userIdCookie;
    let email = null;

    if (userIdCookie) {
      const user = await prisma.user.findUnique({
        where: { id: userIdCookie },
        select: { id: true, email: true },
      });
      if (user) {
        userId = user.id;
        email = user.email;
      }
    }

    if (!userId && (headerEmail || cookieEmail)) {
      email = normalizeEmail(headerEmail || decodeURIComponent(cookieEmail || ''));
      if (email) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true },
        });
        if (user) {
          userId = user.id;
          email = user.email;
        }
      }
    }

    if (!userId) {
      return res.status(401).json({ ok: false, caught: false, error: 'UNAUTHORIZED' });
    }

    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      body = {};
    }
    const rabbitSeqClient = typeof body.rabbitSeqClient === 'number' ? body.rabbitSeqClient : undefined;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        points: true,
        rabbitTarget: true,
        rabbitSeq: true,
      },
    });

    if (!user) {
      return res.status(404).json({ ok: false, caught: false, error: 'user_not_found' });
    }

    // Use rollup total (canonical) for rabbit logic
    let canonicalPoints = user.points ?? 0;
    try {
      const rollup = await getPointsRollupForUser(prisma, user.id);
      canonicalPoints = rollup.totalPoints;
    } catch (rollupErr) {
      console.warn('[rabbit/catch] Rollup failed, using user.points', { userId, error: rollupErr.message });
    }

    const { user: ensured } = await ensureRabbitState(
      prisma,
      { id: user.id, points: user.points, rabbitTarget: user.rabbitTarget, rabbitSeq: user.rabbitSeq },
      canonicalPoints
    );

    if (typeof rabbitSeqClient === 'number' && rabbitSeqClient !== ensured.rabbitSeq) {
      return res.json({ ok: true, caught: false, stale: true });
    }

    if (!ensured.rabbitTarget || canonicalPoints < ensured.rabbitTarget) {
      return res.json({ ok: true, caught: false });
    }

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, points: true, rabbitTarget: true, rabbitSeq: true },
      });

      if (!fresh) {
        return { caught: false, error: 'user_not_found' };
      }

      const freshPoints = canonicalPoints;
      if (!fresh.rabbitTarget || freshPoints < fresh.rabbitTarget) {
        return { caught: false };
      }

      if (typeof rabbitSeqClient === 'number' && fresh.rabbitSeq !== rabbitSeqClient) {
        return { caught: false, stale: true };
      }

      const nextPoints = freshPoints + BONUS_POINTS;
      const nextRankThreshold = calcNextRankThreshold(nextPoints);
      const nextTarget = calcInitialRabbitTarget(nextPoints);

      await tx.ledger.create({
        data: {
          userId: fresh.id,
          type: 'RABBIT_BONUS',
          points: BONUS_POINTS,
          note: `rabbit seq ${fresh.rabbitSeq}`,
        },
      });

      await tx.user.update({
        where: { id: fresh.id },
        data: {
          rabbitTarget: nextTarget,
          rabbitSeq: { increment: 1 },
          lastRabbitCatchAt: new Date(),
        },
      });

      return {
        caught: true,
        points: nextPoints,
        rabbitTarget: nextTarget,
        rabbitSeq: fresh.rabbitSeq + 1,
        nextRankThreshold,
      };
    });

    if (!result.caught) {
      return res.json({
        ok: true,
        caught: false,
        stale: result.stale ?? false,
      });
    }

    return res.json({
      ok: true,
      caught: true,
      points: result.points,
      rabbitTarget: result.rabbitTarget,
      rabbitSeq: result.rabbitSeq,
      nextRankThreshold: result.nextRankThreshold,
    });
  } catch (err) {
    console.error('[rabbit/catch] error', err);
    return res.status(500).json({
      ok: false,
      caught: false,
      error: err.message || 'Failed to process rabbit catch',
    });
  }
}

module.exports = handleRabbitCatch;
