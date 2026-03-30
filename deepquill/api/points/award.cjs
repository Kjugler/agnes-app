// deepquill/api/points/award.cjs
// Endpoint to award points (called from agnes-next moderation routes and general point awards)

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { awardForSignalApproved, awardForReviewApproved } = require('../../lib/points/awardPoints.cjs');
const { customAlphabet } = require('nanoid');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 6;
const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);

// Helper to ensure user exists (from contest/login.cjs pattern)
async function generateUniqueCode(excludeId) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const match = await prisma.user.findFirst({
      where: {
        AND: [
          excludeId ? { id: { not: excludeId } } : {},
          {
            OR: [{ code }, { referralCode: code }],
          },
        ],
      },
      select: { id: true },
    });
    if (!match) return code;
  }
  throw new Error('Unable to generate unique referral code');
}

async function ensureAssociateMinimal(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Invalid email address');
  }

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    const code = await generateUniqueCode();
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        code,
        referralCode: code,
        rabbitSeq: 1,
        rabbitTarget: 500,
      },
    });
    return user;
  }

  if (!user.code || !user.referralCode) {
    const code = await generateUniqueCode(user.id);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        code: user.code || code,
        referralCode: user.referralCode || code,
      },
    });
  }

  if (!user.rabbitTarget || !user.rabbitSeq) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitSeq: user.rabbitSeq && user.rabbitSeq > 0 ? user.rabbitSeq : 1,
        rabbitTarget: user.rabbitTarget && user.rabbitTarget > user.points
          ? user.rabbitTarget
          : 500,
      },
    });
  }

  return user;
}

// Map action types to ledger types and points
const ACTION_MAP = {
  share_x: { type: 'SHARE_X', points: 100 },
  share_ig: { type: 'SHARE_IG', points: 100 },
  share_fb: { type: 'SHARE_FB', points: 100 },
  share_truth: { type: 'SHARE_TRUTH', points: 100 },
  share_tiktok: { type: 'SHARE_TT', points: 100 },
  share_x_back_to_score_bonus: { type: 'SHARE_X_BACK_BONUS', points: 100 },
  contest_join: { type: 'CONTEST_JOIN', points: 250 },
  subscribe_digest: { type: 'SUBSCRIBE_DIGEST', points: 50 },
  signup: { type: 'SIGNUP_BONUS', points: 100 },
};

function getInternalProxySecretTrimmed() {
  const raw = process.env.INTERNAL_PROXY_SECRET;
  if (raw == null) return '';
  return String(raw).trim();
}

module.exports = async (req, res) => {
  // Guard: dev OR valid ADMIN_KEY OR valid INTERNAL_PROXY (agnes-next proxy — same pattern as other proxied routes)
  const isDev = process.env.NODE_ENV === 'development';
  const adminKey = req.headers['x-admin-key'];
  const expectedAdminKey = process.env.ADMIN_KEY ? String(process.env.ADMIN_KEY).trim() : '';
  const proxyExpected = getInternalProxySecretTrimmed();
  const proxyProvided = String(req.headers['x-internal-proxy'] || '').trim();
  const adminOk = Boolean(expectedAdminKey) && adminKey === expectedAdminKey;
  const proxyOk = Boolean(proxyExpected) && proxyProvided === proxyExpected;

  if (process.env.SHARE_FLOW_DEBUG === '1') {
    console.log('[api/points/award] auth', {
      isDev,
      adminOk,
      proxyOk,
      hasAdminKeyEnv: Boolean(expectedAdminKey),
      hasInternalProxyEnv: Boolean(proxyExpected),
    });
  }

  if (!isDev && !adminOk && !proxyOk) {
    const hint =
      !expectedAdminKey && !proxyExpected
        ? 'Set ADMIN_KEY (and x-admin-key from agnes-next) or INTERNAL_PROXY_SECRET (and x-internal-proxy) on both services.'
        : !adminOk && expectedAdminKey
          ? 'Invalid or missing x-admin-key.'
          : 'Invalid or missing x-internal-proxy.';
    return res.status(403).json({
      error: 'Forbidden - Development only or valid x-admin-key / internal proxy required',
      hint,
    });
  }

  try {
    const body = req.body;
    const { type, userId, signalId, reviewId, kind, action, email } = body;

    // Handle moderation routes (signal_approved, review_approved)
    if (type === 'signal_approved') {
      if (!userId || !signalId) {
        return res.status(400).json({
          error: 'Missing required fields: userId, signalId',
        });
      }
      const result = await awardForSignalApproved({ userId, signalId });
      return res.json({
        ok: true,
        awarded: result.awarded,
        reason: result.reason,
      });
    }

    if (type === 'review_approved') {
      if (!userId || !reviewId) {
        return res.status(400).json({
          error: 'Missing required fields: userId, reviewId',
        });
      }
      const result = await awardForReviewApproved({ userId, reviewId });
      return res.json({
        ok: true,
        awarded: result.awarded,
        reason: result.reason,
      });
    }

    // Handle general point awards (contest_join, signup, etc.)
    const actionType = kind || action || type;
    if (!actionType) {
      return res.status(400).json({
        error: 'Missing required field: kind, action, or type',
      });
    }

    // Resolve user by email or userId
    let user;
    if (email) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return res.status(400).json({
          error: 'Invalid email address',
        });
      }
      user = await ensureAssociateMinimal(normalizedEmail);
    } else if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
        });
      }
    } else {
      return res.status(400).json({
        error: 'Missing required field: email or userId',
      });
    }

    // Map action to ledger type and points
    const mapped = ACTION_MAP[actionType.toLowerCase()];
    if (!mapped) {
      return res.status(400).json({
        error: `Unknown action type: ${actionType}. Supported: ${Object.keys(ACTION_MAP).join(', ')}`,
      });
    }

    // Check if already awarded (idempotency for non-share actions)
    const isShareAction = actionType.toLowerCase().startsWith('share_');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const existingLedger = await prisma.ledger.findFirst({
      where: {
        userId: user.id,
        type: mapped.type,
        ...(isShareAction ? { createdAt: { gte: startOfToday } } : {}),
      },
    });

    if (existingLedger) {
      console.log('[api/points/award] Already awarded', {
        userId: user.id,
        type: mapped.type,
        actionType,
      });
      return res.json({
        ok: true,
        awarded: 0,
        reason: 'already_awarded',
        user: {
          id: user.id,
          email: user.email,
          points: user.points,
        },
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
          note: `Auto award ${actionType}`,
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
      console.warn('[api/points/award] Failed to get rollup after award', {
        error: rollupErr.message,
        userId: user.id,
      });
    }

    console.log('[api/points/award] Points awarded', {
      userId: user.id,
      type: mapped.type,
      points: mapped.points,
      actionType,
      totalPoints, // A1: From rollup (canonical)
    });

    return res.json({
      ok: true,
      awarded: mapped.points,
      reason: 'awarded',
      user: {
        id: user.id,
        email: user.email,
        points: totalPoints, // A1: From rollup (canonical)
      },
    });
  } catch (err) {
    console.error('[api/points/award] Error', err);
    return res.status(500).json({
      error: err.message || 'Failed to award points',
    });
  }
};
