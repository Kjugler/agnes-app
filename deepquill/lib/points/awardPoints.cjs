// deepquill/lib/points/awardPoints.cjs
// Centralized point awarding logic with guardrails

const { prisma } = require('../../server/prisma.cjs');
const { recordLedgerEntry } = require('../ledger/recordLedger.cjs');
const { LedgerType } = require('@prisma/client');

/** Start of today (server local time) for calendar-day cap */
function getStartOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of tomorrow for calendar-day cap */
function getStartOfTomorrow() {
  const d = getStartOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Award purchase points (Math Mode - deterministic):
 * - Awards +500 points per purchase
 * - Daily cap: 1 award per user per calendar day (max 500 points/day)
 * - Idempotency: one award per sessionId (prevents double-crediting on webhook retries)
 * - Returns { awarded: number, reason: string }
 * @param {Object} prismaClient - Prisma client instance (required)
 * @param {Object} params - { userId, sessionId }
 */
async function awardPurchaseDailyPoints(prismaClient, { userId, sessionId }) {
  if (!userId) {
    console.log('[POINTS] purchase_points_skipped: missing userId');
    return { awarded: 0, reason: 'missing_user_id' };
  }

  if (!sessionId) {
    console.log('[POINTS] purchase_points_skipped: missing sessionId');
    return { awarded: 0, reason: 'missing_session_id' };
  }

  if (!prismaClient) {
    console.error('[POINTS] prismaClient missing - cannot award purchase points');
    throw new Error('[POINTS] prismaClient is required but was not provided');
  }

  try {
    // Idempotency check: has this session already been awarded?
    const existingAward = await prismaClient.ledger.findUnique({
      where: {
        uniq_ledger_type_session_user: {
          sessionId,
          type: 'POINTS_AWARDED_PURCHASE',
          userId,
        },
      },
    });

    if (existingAward) {
      console.log('[POINTS] purchase_points_skipped_already_awarded', { userId, sessionId });
      return { awarded: 0, reason: 'already_awarded_for_session' };
    }

    // Daily cap: 1 award per user per calendar day
    const startOfToday = getStartOfToday();
    const startOfTomorrow = getStartOfTomorrow();
    const todayAward = await prismaClient.ledger.findFirst({
      where: {
        userId,
        type: 'POINTS_AWARDED_PURCHASE',
        createdAt: { gte: startOfToday, lt: startOfTomorrow },
      },
      select: { id: true },
    });
    if (todayAward) {
      console.log('[POINTS] purchase_points_skipped_daily_cap', { userId, sessionId });
      return { awarded: 0, reason: 'daily_cap_reached' };
    }

    // A2: Award points - create ledger entry ONLY (no user.points increment)
    // Totals are computed from ledger rollup (canonical source of truth)
    await prismaClient.$transaction(async (tx) => {
      // Record in Ledger (idempotent by sessionId+type+userId via unique constraint)
      await tx.ledger.create({
        data: {
          sessionId,
          userId,
          type: 'POINTS_AWARDED_PURCHASE',
          points: 500,
          amount: 500,
          currency: 'points',
          note: 'Points awarded for purchase',
          meta: {
            reason: 'awarded',
          },
        },
      });
      // A2: Do NOT increment user.points - ledger is canonical, totals come from rollup
    });

    console.log('[POINTS] purchase_points_awarded', { userId, sessionId, points: 500 });
    return { awarded: 500, reason: 'awarded' };
  } catch (error) {
    // Handle unique constraint violation (idempotency - another process already awarded)
    if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
      console.log('[POINTS] purchase_points_skipped_already_awarded_unique', { userId, sessionId });
      return { awarded: 0, reason: 'already_awarded_for_session' };
    }
    console.error('[POINTS] Error awarding purchase points', { userId, sessionId, error: error.message, stack: error.stack });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

const REFERRAL_DAILY_CAP = 5;  // Max 5 referral awards per day (25,000 points)
const REFERRAL_POINTS_PER_REFERRAL = 5000;

/**
 * Award referral sponsor points (Math Mode - deterministic):
 * - Awards +5,000 points to sponsor per referred purchase
 * - Daily cap: 5 referral awards per sponsor per calendar day (max 25,000 points/day)
 * - Idempotency: one award per sessionId (prevents double-crediting on webhook retries)
 * - Returns { awarded: number, reason: string }
 * @param {Object} prismaClient - Prisma client instance (required)
 * @param {Object} params - { referrerUserId, sessionId, buyerUserId, product }
 */
async function awardReferralSponsorPoints(prismaClient, { referrerUserId, sessionId, buyerUserId, product }) {
  if (!referrerUserId) {
    console.log('[POINTS] referral_sponsor_skip: missing referrerUserId');
    return { awarded: 0, reason: 'missing_referrer_user_id' };
  }

  if (!sessionId) {
    console.log('[POINTS] referral_sponsor_skip: missing sessionId');
    return { awarded: 0, reason: 'missing_session_id' };
  }

  if (!prismaClient) {
    console.error('[POINTS] prismaClient missing - cannot award referral sponsor points');
    throw new Error('[POINTS] prismaClient is required but was not provided');
  }

  try {
    // Idempotency check: has this session already been awarded to this sponsor?
    const existingAward = await prismaClient.ledger.findUnique({
      where: {
        uniq_ledger_type_session_user: {
          sessionId,
          type: 'REFERRAL_POINTS_AWARDED',
          userId: referrerUserId,
        },
      },
    });

    if (existingAward) {
      console.log('[POINTS] referral_sponsor_skip_already_awarded', { referrerUserId, sessionId });
      return { awarded: 0, reason: 'already_awarded_for_session' };
    }

    // Daily cap: 5 referral awards per sponsor per calendar day (25,000 points)
    const startOfToday = getStartOfToday();
    const startOfTomorrow = getStartOfTomorrow();
    const todayCount = await prismaClient.ledger.count({
      where: {
        userId: referrerUserId,
        type: 'REFERRAL_POINTS_AWARDED',
        createdAt: { gte: startOfToday, lt: startOfTomorrow },
      },
    });
    if (todayCount >= REFERRAL_DAILY_CAP) {
      console.log('[POINTS] referral_sponsor_skip_daily_cap', { referrerUserId, sessionId, todayCount });
      return { awarded: 0, reason: 'daily_cap_reached' };
    }

    // A2: Award points - create ledger entry ONLY (no user.points increment)
    // Totals are computed from ledger rollup (canonical source of truth)
    await prismaClient.$transaction(async (tx) => {
      // Record in Ledger (idempotent by sessionId+type+userId via unique constraint)
      await tx.ledger.create({
        data: {
          sessionId,
          userId: referrerUserId,
          type: 'REFERRAL_POINTS_AWARDED',
          points: 5000,
          amount: 5000,
          currency: 'points',
          note: `Referral sponsor points awarded for purchase by referred buyer`,
          meta: {
            buyerUserId: buyerUserId || null,
            product: product || null,
            reason: 'awarded',
          },
        },
      });
      // A2: Do NOT increment user.points - ledger is canonical, totals come from rollup
    });

    console.log('[POINTS] referral_sponsor_awarded', { referrerUserId, sessionId, buyerUserId, points: 5000 });
    return { awarded: 5000, reason: 'awarded' };
  } catch (error) {
    // Handle unique constraint violation (idempotency - another process already awarded)
    if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
      console.log('[POINTS] referral_sponsor_skip_already_awarded_unique', { referrerUserId, sessionId });
      return { awarded: 0, reason: 'already_awarded_for_session' };
    }
    console.error('[POINTS] Error awarding referral sponsor points', { referrerUserId, sessionId, error: error.message, stack: error.stack });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

/**
 * Legacy referral points function (kept for backward compatibility)
 * This is now replaced by awardReferralSponsorPoints for Math Mode
 * @deprecated Use awardReferralSponsorPoints instead
 */
async function awardReferralPoints(prismaClient, { referrerId, referredUserId, sku, purchaseDay, purchaseId }) {
  console.warn('[POINTS] awardReferralPoints is deprecated - use awardReferralSponsorPoints for Math Mode');
  // Return 0 to prevent legacy code from awarding points
  return { awarded: 0, reason: 'deprecated_use_awardReferralSponsorPoints' };
}

/**
 * Award points for Signal approval:
 * - Awards points when a Signal is approved
 * - Idempotent via Ledger (sessionId = signal_approved_<signalId>)
 * - Returns { awarded: number, reason: string }
 */
async function awardForSignalApproved({ userId, signalId }) {
  if (!userId || !signalId) {
    console.log('[POINTS] signal_approved_skip: missing userId or signalId');
    return { awarded: 0, reason: 'missing_params' };
  }

  if (!prisma) {
    console.log('[POINTS] signal_approved_skip: prisma not available');
    return { awarded: 0, reason: 'no_prisma' };
  }

  const pointsAmount = 100;
  const sessionId = `signal_approved_${signalId}`;

  try {
    const existing = await prisma.ledger.findUnique({
      where: {
        uniq_ledger_type_session_user: {
          sessionId,
          type: LedgerType.SIGNAL_APPROVED,
          userId,
        },
      },
    });
    if (existing) {
      console.log('[POINTS] signal_approved_skip: already awarded (idempotent)', { userId, signalId });
      return { awarded: 0, reason: 'already_awarded' };
    }

    await recordLedgerEntry(prisma, {
      sessionId,
      userId,
      type: LedgerType.SIGNAL_APPROVED,
      points: pointsAmount,
      amount: pointsAmount,
      currency: 'points',
      note: 'Signal approved',
      meta: { signalId },
    });
    console.log('[POINTS] signal_approved_awarded', { userId, signalId, points: pointsAmount });
    return { awarded: pointsAmount, reason: 'awarded' };
  } catch (error) {
    if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
      console.log('[POINTS] signal_approved_skip: already awarded (idempotent)', { userId, signalId });
      return { awarded: 0, reason: 'already_awarded' };
    }
    console.error('[POINTS] Error awarding signal approval points', { userId, signalId, error: error.message });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

/**
 * Award points for Review approval:
 * - Awards points when a Review is approved
 * - Idempotent via Ledger (sessionId = review_approved_<reviewId>)
 * - Returns { awarded: number, reason: string }
 */
async function awardForReviewApproved({ userId, reviewId }) {
  if (!userId || !reviewId) {
    console.log('[POINTS] review_approved_skip: missing userId or reviewId');
    return { awarded: 0, reason: 'missing_params' };
  }

  if (!prisma) {
    console.log('[POINTS] review_approved_skip: prisma not available');
    return { awarded: 0, reason: 'no_prisma' };
  }

  const pointsAmount = 150;
  const sessionId = `review_approved_${reviewId}`;

  try {
    const existing = await prisma.ledger.findUnique({
      where: {
        uniq_ledger_type_session_user: {
          sessionId,
          type: LedgerType.REVIEW_APPROVED,
          userId,
        },
      },
    });
    if (existing) {
      console.log('[POINTS] review_approved_skip: already awarded (idempotent)', { userId, reviewId });
      return { awarded: 0, reason: 'already_awarded' };
    }

    await recordLedgerEntry(prisma, {
      sessionId,
      userId,
      type: LedgerType.REVIEW_APPROVED,
      points: pointsAmount,
      amount: pointsAmount,
      currency: 'points',
      note: 'Review approved',
      meta: { reviewId },
    });
    console.log('[POINTS] review_approved_awarded', { userId, reviewId, points: pointsAmount });
    return { awarded: pointsAmount, reason: 'awarded' };
  } catch (error) {
    if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
      console.log('[POINTS] review_approved_skip: already awarded (idempotent)', { userId, reviewId });
      return { awarded: 0, reason: 'already_awarded' };
    }
    console.error('[POINTS] Error awarding review approval points', { userId, reviewId, error: error.message });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

module.exports = {
  awardPurchaseDailyPoints,
  awardReferralSponsorPoints,
  awardReferralPoints, // Legacy - kept for backward compatibility
  awardForSignalApproved,
  awardForReviewApproved,
};
