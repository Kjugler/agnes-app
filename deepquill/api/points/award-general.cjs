// deepquill/api/points/award-general.cjs
// General points award endpoint (contest_join, signup, shares, etc.)
// Called from agnes-next via proxy

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');

// Map action strings to ledger types and points
const ACTION_MAP = {
  contest_join: { type: 'CONTEST_JOIN', points: 250 },
  signup: { type: 'SIGNUP_BONUS', points: 100 },
  share_x: { type: 'SHARE_X', points: 100 },
  share_ig: { type: 'SHARE_IG', points: 100 },
  share_fb: { type: 'SHARE_FB', points: 100 },
  share_truth: { type: 'SHARE_TRUTH', points: 100 },
  share_tiktok: { type: 'SHARE_TT', points: 100 },
  share_x_back_to_score_bonus: { type: 'SHARE_X_BACK_BONUS', points: 100 },
  subscribe_digest: { type: 'SUBSCRIBE_DIGEST', points: 50 },
};

/**
 * Award general points (contest_join, signup, shares, etc.)
 * POST /api/points/award-general
 * Body: { action: string, email: string }
 */
async function handleAwardGeneralPoints(req, res) {
  try {
    ensureDatabaseUrl();
    
    const body = req.body || {};
    const action = body.action || body.kind;
    const emailRaw = req.headers['x-user-email'] || body.email;

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: 'action parameter is required',
      });
    }

    if (!emailRaw) {
      return res.status(400).json({
        ok: false,
        error: 'email is required (via x-user-email header or body.email)',
      });
    }

    const email = normalizeEmail(emailRaw);
    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email address',
      });
    }

    const mapped = ACTION_MAP[action];
    if (!mapped) {
      return res.status(400).json({
        ok: false,
        error: `Unknown action: ${action}. Supported: ${Object.keys(ACTION_MAP).join(', ')}`,
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // User doesn't exist - create minimal user
      const { customAlphabet } = require('nanoid');
      const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const CODE_SIZE = 6;
      const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);
      
      let code;
      for (let i = 0; i < 10; i++) {
        code = generateCode();
        const match = await prisma.user.findFirst({
          where: {
            OR: [{ code }, { referralCode: code }],
          },
          select: { id: true },
        });
        if (!match) break;
      }
      if (!code) {
        throw new Error('Unable to generate unique code');
      }

      user = await prisma.user.create({
        data: {
          email,
          code,
          referralCode: code,
          rabbitSeq: 1,
          rabbitTarget: 500,
        },
      });
    }

    // Check if already awarded (idempotency)
    // For daily actions (shares), check today only
    // For one-time actions (contest_join, signup), check all time
    const isDailyAction = action.startsWith('share_');
    const whereClause = {
      userId: user.id,
      type: mapped.type,
    };

    if (isDailyAction) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      whereClause.createdAt = { gte: startOfToday };
    }

    const existing = await prisma.ledger.findFirst({
      where: whereClause,
      select: { id: true },
    });

    if (existing) {
      console.log('[POINTS] General points already awarded', {
        action,
        userId: user.id,
        type: mapped.type,
      });
      return res.json({
        ok: true,
        awarded: 0,
        reason: 'already_awarded',
        totalPoints: user.points,
      });
    }

    // A2: Award points - create ledger entry ONLY (no user.points increment)
    await prisma.$transaction(async (tx) => {
      await tx.ledger.create({
        data: {
          userId: user.id,
          type: mapped.type,
          points: mapped.points,
          amount: mapped.points,
          currency: 'points',
          note: `Auto award ${action}`,
        },
      });
      // A2: Do NOT increment user.points - ledger is canonical, totals come from rollup
    });

    // A1: Get total from rollup (canonical source)
    const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
    let totalPoints = 0;
    try {
      const rollup = await getPointsRollupForUser(prisma, user.id);
      totalPoints = rollup.totalPoints;
    } catch (rollupErr) {
      console.warn('[POINTS] Failed to get rollup after award-general', {
        error: rollupErr.message,
        userId: user.id,
      });
    }

    console.log('[POINTS] General points awarded', {
      action,
      userId: user.id,
      type: mapped.type,
      points: mapped.points,
      totalPoints, // A1: From rollup (canonical)
    });

    return res.json({
      ok: true,
      awarded: mapped.points,
      reason: 'awarded',
      totalPoints, // A1: From rollup (canonical)
    });
  } catch (err) {
    console.error('[api/points/award-general] Error', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Failed to award points',
    });
  }
}

module.exports = handleAwardGeneralPoints;
