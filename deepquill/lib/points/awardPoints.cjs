/**
 * Centralized point awarding logic with guardrails (anti-gaming)
 * 
 * Rules:
 * - Purchase points: max 500/day, max 3 credited days lifetime (1500 total)
 * - Referral points: max 3 awards per referrer-referred pair (3 different SKUs on 3 different days)
 */

const { getPrisma } = require('../../server/prisma.cjs');

const PURCHASE_POINTS = 500;
const REFERRAL_POINTS = 1000; // 1000 points per referral conversion (matches webhook behavior)

/**
 * Award purchase points with daily and lifetime caps
 * @param {Object} params
 * @param {string} params.userId - Buyer user ID
 * @param {string} [params.purchaseId] - Purchase ID (optional)
 * @param {Date} [params.now] - Current timestamp (defaults to now)
 * @returns {Promise<{awarded: number, reason: string}>}
 */
async function awardPurchaseDailyPoints({ userId, purchaseId, now = new Date() }) {
  const prisma = getPrisma();
  
  // Compute awardDay in YYYY-MM-DD format (UTC)
  const awardDay = now.toISOString().split('T')[0]; // e.g., "2024-01-15"
  
  try {
    // Check if user already has an award for this day
    const existingDaily = await prisma.pointAward.findUnique({
      where: {
        purchase_daily_unique: {
          userId,
          kind: 'PURCHASE_DAILY_500',
          awardDay,
        },
      },
    });
    
    if (existingDaily) {
      console.log('[awardPoints] Purchase points skipped (daily cap)', {
        userId,
        awardDay,
        reason: 'already_awarded_today',
      });
      return { awarded: 0, reason: 'daily_cap' };
    }
    
    // Check lifetime cap: count how many distinct days user has been awarded
    const lifetimeCount = await prisma.pointAward.count({
      where: {
        userId,
        kind: 'PURCHASE_DAILY_500',
      },
    });
    
    if (lifetimeCount >= 3) {
      console.log('[awardPoints] Purchase points skipped (lifetime cap)', {
        userId,
        lifetimeCount,
        reason: 'max_3_days_reached',
      });
      return { awarded: 0, reason: 'lifetime_cap' };
    }
    
    // Award points: create PointAward record and increment user points
    await prisma.$transaction([
      prisma.pointAward.create({
        data: {
          userId,
          kind: 'PURCHASE_DAILY_500',
          awardDay,
          purchaseId: purchaseId || null,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          points: { increment: PURCHASE_POINTS },
          earnedPurchaseBook: true,
        },
      }),
    ]);
    
    console.log('[awardPoints] Purchase points awarded', {
      userId,
      awardDay,
      points: PURCHASE_POINTS,
      lifetimeDays: lifetimeCount + 1,
    });
    
    return { awarded: PURCHASE_POINTS, reason: 'awarded' };
  } catch (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === 'P2002') {
      console.log('[awardPoints] Purchase points skipped (race condition)', {
        userId,
        awardDay,
        reason: 'concurrent_award',
      });
      return { awarded: 0, reason: 'race_condition' };
    }
    
    console.error('[awardPoints] Error awarding purchase points', {
      userId,
      awardDay,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Award referral points with guardrails
 * @param {Object} params
 * @param {string} params.referrerId - Referrer user ID
 * @param {string} params.referredUserId - Referred friend user ID
 * @param {string} params.sku - Catalog item SKU (book, ebook, audio)
 * @param {Date} [params.purchaseDay] - Purchase date (defaults to now)
 * @param {string} [params.purchaseId] - Purchase ID (optional)
 * @returns {Promise<{awarded: number, reason: string}>}
 */
async function awardReferralPoints({ referrerId, referredUserId, sku, purchaseDay = new Date(), purchaseId }) {
  const prisma = getPrisma();
  
  // Skip if referredUserId is null (buyer not found)
  if (!referredUserId) {
    console.log('[awardPoints] Referral points skipped (no referred user)', {
      referrerId,
      sku,
      reason: 'no_referred_user',
    });
    return { awarded: 0, reason: 'no_referred_user' };
  }
  
  // Compute awardDay in YYYY-MM-DD format (UTC)
  const awardDay = purchaseDay.toISOString().split('T')[0];
  
  try {
    // Get all existing referral awards for this pair
    const existingAwards = await prisma.pointAward.findMany({
      where: {
        referrerId,
        referredUserId,
        kind: 'REFERRAL_ITEM_500',
      },
    });
    
    // Check: same day (must be different days)
    const sameDayAward = existingAwards.find(a => a.awardDay === awardDay);
    if (sameDayAward) {
      console.log('[awardPoints] Referral points skipped (same day)', {
        referrerId,
        referredUserId,
        sku,
        awardDay,
        reason: 'same_day',
      });
      return { awarded: 0, reason: 'same_day' };
    }
    
    // Check: same SKU (must be different items)
    const sameSkuAward = existingAwards.find(a => a.sku === sku);
    if (sameSkuAward) {
      console.log('[awardPoints] Referral points skipped (same SKU)', {
        referrerId,
        referredUserId,
        sku,
        reason: 'same_sku',
      });
      return { awarded: 0, reason: 'same_sku' };
    }
    
    // Check: max 3 total awards per pair
    if (existingAwards.length >= 3) {
      console.log('[awardPoints] Referral points skipped (max 3 reached)', {
        referrerId,
        referredUserId,
        sku,
        existingCount: existingAwards.length,
        reason: 'max_3_reached',
      });
      return { awarded: 0, reason: 'max_3_reached' };
    }
    
    // Award points: create PointAward record and increment referrer points
    await prisma.$transaction([
      prisma.pointAward.create({
        data: {
          userId: referrerId, // Points go to referrer
          kind: 'REFERRAL_ITEM_500',
          awardDay,
          sku,
          referrerId,
          referredUserId,
          purchaseId: purchaseId || null,
        },
      }),
      prisma.user.update({
        where: { id: referrerId },
        data: {
          points: { increment: REFERRAL_POINTS },
        },
      }),
    ]);
    
    console.log('[awardPoints] Referral points awarded', {
      referrerId,
      referredUserId,
      sku,
      awardDay,
      points: REFERRAL_POINTS,
      totalAwards: existingAwards.length + 1,
    });
    
    return { awarded: REFERRAL_POINTS, reason: 'awarded' };
  } catch (error) {
    // Handle unique constraint violation (race condition or duplicate SKU)
    if (error.code === 'P2002') {
      console.log('[awardPoints] Referral points skipped (constraint violation)', {
        referrerId,
        referredUserId,
        sku,
        reason: 'duplicate_or_race',
      });
      return { awarded: 0, reason: 'constraint_violation' };
    }
    
    console.error('[awardPoints] Error awarding referral points', {
      referrerId,
      referredUserId,
      sku,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  awardPurchaseDailyPoints,
  awardReferralPoints,
  PURCHASE_POINTS,
  REFERRAL_POINTS,
};

