// deepquill/lib/points/awardPoints.cjs
// Centralized point awarding logic with guardrails

const { prisma } = require('../../server/prisma.cjs');

/**
 * Award purchase daily points with guardrails:
 * - Maximum 500 points per day per user
 * - Maximum 3 distinct days total (lifetime cap = 1,500 points)
 * - Returns { awarded: number, reason: string }
 */
async function awardPurchaseDailyPoints({ userId, purchaseId, now }) {
  if (!userId) {
    console.log('[POINTS] purchase_points_skipped: missing userId');
    return { awarded: 0, reason: 'missing_user_id' };
  }

  if (!prisma) {
    console.log('[POINTS] purchase_points_skipped: prisma not available');
    return { awarded: 0, reason: 'no_prisma' };
  }

  try {
    // Get award day in YYYY-MM-DD format (UTC)
    const awardDay = now ? new Date(now).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // Check if user already got points for this day
    const existingAward = await prisma.pointAward.findUnique({
      where: {
        unique_purchase_daily_cap: {
          userId,
          kind: 'PURCHASE_DAILY_500',
          awardDay,
        },
      },
    });

    if (existingAward) {
      console.log('[POINTS] purchase_points_skipped_daily', { userId, awardDay });
      return { awarded: 0, reason: 'daily_cap_reached' };
    }

    // Check how many distinct days the user has been awarded
    const distinctDays = await prisma.pointAward.findMany({
      where: {
        userId,
        kind: 'PURCHASE_DAILY_500',
      },
      select: {
        awardDay: true,
      },
      distinct: ['awardDay'],
    });

    if (distinctDays.length >= 3) {
      console.log('[POINTS] purchase_points_skipped_lifetime_cap', { userId, distinctDaysCount: distinctDays.length });
      return { awarded: 0, reason: 'lifetime_cap_reached' };
    }

    // Award points
    await prisma.pointAward.create({
      data: {
        userId,
        kind: 'PURCHASE_DAILY_500',
        awardDay,
        purchaseId: purchaseId || null,
      },
    });

    // Update user points
    await prisma.user.update({
      where: { id: userId },
      data: {
        points: {
          increment: 500,
        },
      },
    });

    console.log('[POINTS] purchase_points_awarded', { userId, awardDay, points: 500 });
    return { awarded: 500, reason: 'awarded' };
  } catch (error) {
    // Handle unique constraint violation (idempotency)
    if (error.code === 'P2002') {
      console.log('[POINTS] purchase_points_skipped: already awarded (idempotent)', { userId });
      return { awarded: 0, reason: 'already_awarded' };
    }

    console.error('[POINTS] Error awarding purchase points', { userId, error: error.message });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

/**
 * Award referral points with guardrails:
 * - Maximum 3 awards per referrer-referred pair
 * - Must be different SKUs on different calendar days
 * - Returns { awarded: number, reason: string }
 */
async function awardReferralPoints({ referrerId, referredUserId, sku, purchaseDay, purchaseId }) {
  if (!referrerId || !referredUserId || !sku) {
    console.log('[POINTS] referral_skip: missing required params', { referrerId: !!referrerId, referredUserId: !!referredUserId, sku: !!sku });
    return { awarded: 0, reason: 'missing_params' };
  }

  if (!prisma) {
    console.log('[POINTS] referral_skip: prisma not available');
    return { awarded: 0, reason: 'no_prisma' };
  }

  try {
    // Get purchase day in YYYY-MM-DD format (UTC)
    const awardDay = purchaseDay ? new Date(purchaseDay).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // Check if this referrer-referred pair already has 3 awards
    const existingAwards = await prisma.pointAward.findMany({
      where: {
        referrerId,
        referredUserId,
        kind: 'REFERRAL_ITEM_500',
      },
    });

    if (existingAwards.length >= 3) {
      console.log('[POINTS] referral_skip_max3', { referrerId, referredUserId, count: existingAwards.length });
      return { awarded: 0, reason: 'max_3_reached' };
    }

    // Check if this exact SKU was already awarded for this pair
    const sameSkuAward = existingAwards.find(a => a.sku === sku);
    if (sameSkuAward) {
      console.log('[POINTS] referral_skip_same_sku', { referrerId, referredUserId, sku });
      return { awarded: 0, reason: 'same_sku_already_awarded' };
    }

    // Check if there's an award on the same day (even if different SKU)
    const sameDayAward = existingAwards.find(a => a.awardDay === awardDay);
    if (sameDayAward) {
      console.log('[POINTS] referral_skip_same_day', { referrerId, referredUserId, awardDay });
      return { awarded: 0, reason: 'same_day_already_awarded' };
    }

    // Award points
    await prisma.pointAward.create({
      data: {
        userId: referrerId, // Points go to referrer
        kind: 'REFERRAL_ITEM_500',
        awardDay,
        sku,
        referrerId,
        referredUserId,
        purchaseId: purchaseId || null,
      },
    });

    // Update referrer's points
    await prisma.user.update({
      where: { id: referrerId },
      data: {
        points: {
          increment: 500,
        },
      },
    });

    console.log('[POINTS] referral_awarded', { referrerId, referredUserId, sku, awardDay, points: 500 });
    return { awarded: 500, reason: 'awarded' };
  } catch (error) {
    // Handle unique constraint violation (idempotency)
    if (error.code === 'P2002') {
      console.log('[POINTS] referral_skip: already awarded (idempotent)', { referrerId, referredUserId, sku });
      return { awarded: 0, reason: 'already_awarded' };
    }

    console.error('[POINTS] Error awarding referral points', { referrerId, referredUserId, sku, error: error.message });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

/**
 * Award points for Signal approval:
 * - Awards points when a Signal is approved
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

  try {
    // 1.4: Idempotency check - use unique constraint (userId, kind, purchaseId)
    const pointsAmount = 100;
    const awardDay = new Date().toISOString().split('T')[0];

    try {
      await prisma.pointAward.create({
        data: {
          userId,
          kind: 'SIGNAL_APPROVED',
          awardDay,
          purchaseId: signalId, // Reusing purchaseId field to store signalId
        },
      });
    } catch (createError) {
      // Handle unique constraint violation (idempotency)
      if (createError.code === 'P2002') {
        console.log('[POINTS] signal_approved_skip: already awarded (idempotent)', { userId, signalId });
        return { awarded: 0, reason: 'already_awarded' };
      }
      throw createError; // Re-throw other errors
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: pointsAmount },
      },
    });

    console.log('[POINTS] signal_approved_awarded', { userId, signalId, points: pointsAmount });
    return { awarded: pointsAmount, reason: 'awarded' };
  } catch (error) {
    if (error.code === 'P2002') {
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

  try {
    // 1.4: Idempotency check - use unique constraint (userId, kind, purchaseId)
    const pointsAmount = 150;
    const awardDay = new Date().toISOString().split('T')[0];

    try {
      await prisma.pointAward.create({
        data: {
          userId,
          kind: 'REVIEW_APPROVED',
          awardDay,
          purchaseId: reviewId, // Reusing purchaseId field to store reviewId
        },
      });
    } catch (createError) {
      // Handle unique constraint violation (idempotency)
      if (createError.code === 'P2002') {
        console.log('[POINTS] review_approved_skip: already awarded (idempotent)', { userId, reviewId });
        return { awarded: 0, reason: 'already_awarded' };
      }
      throw createError; // Re-throw other errors
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: pointsAmount },
      },
    });

    console.log('[POINTS] review_approved_awarded', { userId, reviewId, points: pointsAmount });
    return { awarded: pointsAmount, reason: 'awarded' };
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('[POINTS] review_approved_skip: already awarded (idempotent)', { userId, reviewId });
      return { awarded: 0, reason: 'already_awarded' };
    }

    console.error('[POINTS] Error awarding review approval points', { userId, reviewId, error: error.message });
    return { awarded: 0, reason: `error: ${error.message}` };
  }
}

module.exports = {
  awardPurchaseDailyPoints,
  awardReferralPoints,
  awardForSignalApproved,
  awardForReviewApproved,
};
