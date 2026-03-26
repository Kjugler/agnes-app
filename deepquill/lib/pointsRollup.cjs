// deepquill/lib/pointsRollup.cjs
// Single source of truth for points totals - computed from ledger rollup

const { ensureDatabaseUrl } = require('../server/prisma.cjs');

/**
 * Get points rollup for a user (single source of truth)
 * Computes totals from ledger entries, excluding email/USD entries
 * 
 * @param {Object} prismaClient - Prisma client instance (required)
 * @param {string} userId - User ID to calculate points for
 * @returns {Promise<Object>} { totalPoints, purchasePoints, referralPoints, basePoints, breakdownByType }
 */
async function getPointsRollupForUser(prismaClient, userId) {
  if (!prismaClient) {
    throw new Error('[POINTS_ROLLUP] prismaClient is required');
  }
  if (!userId) {
    throw new Error('[POINTS_ROLLUP] userId is required');
  }

  try {
    ensureDatabaseUrl();

    // Fetch all ledger entries for this user
    // A1: Exclude email and USD entries - only count points entries
    const ledgerEntries = await prismaClient.ledger.findMany({
      where: {
        userId,
        // Include entries with points > 0 OR currency === 'points'
        // Exclude entries with currency: 'email' or currency: 'usd'
        OR: [
          { points: { gt: 0 } }, // Entries with positive points
          { currency: 'points' }, // Explicit points entries (even if 0)
        ],
        NOT: [
          { currency: 'email' }, // Exclude email delivery entries
          { currency: 'usd' }, // Exclude USD-only entries (commissions, discounts)
        ],
      },
      select: {
        type: true,
        points: true,
        currency: true,
      },
    });

    // Initialize breakdown
    let totalPoints = 0;
    let purchasePoints = 0;
    let referralPoints = 0;
    let basePoints = 0;
    const breakdownByType = {};

    // C1: Log ledger entries for debugging (especially REFERRAL_POINTS_AWARDED and REFER_EMAIL)
    const referEmailEntries = ledgerEntries.filter(e => e.type === 'REFER_EMAIL');
    console.log('[POINTS_ROLLUP] Processing ledger entries', {
      userId,
      entryCount: ledgerEntries.length,
      types: ledgerEntries.map(e => e.type),
      referralPointsEntries: ledgerEntries.filter(e => e.type === 'REFERRAL_POINTS_AWARDED'),
      referEmailEntries: referEmailEntries.length,
      referEmailPoints: referEmailEntries.reduce((sum, e) => sum + (e.points || 0), 0),
    });

    // Rollup points by type
    for (const entry of ledgerEntries) {
      const points = entry.points || 0;
      
      // Skip entries with 0 points (they're already filtered by query, but be defensive)
      // REFER_EMAIL entries with 0 points are audit trail only (daily cap reached) and shouldn't contribute to totals
      if (points === 0) {
        continue;
      }

      // Skip email and USD entries (defensive - already filtered)
      if (entry.currency === 'email' || entry.currency === 'usd') {
        continue;
      }

      totalPoints += points;

      // Categorize by type
      const type = entry.type;
      if (!breakdownByType[type]) {
        breakdownByType[type] = 0;
      }
      breakdownByType[type] += points;

      // Purchase points
      if (
        type === 'PURCHASE_BOOK' ||
        type === 'POINTS_AWARDED_PURCHASE' ||
        type === 'PURCHASE_RECORDED'
      ) {
        purchasePoints += points;
      }
      // Referral points (C1: Includes REFERRAL_POINTS_AWARDED - sponsor points)
      else if (
        type === 'REFER_FRIEND_PAYOUT' ||
        type === 'REFER_EMAIL' ||
        type === 'REFER_PURCHASE' ||
        type === 'REFERRAL_POINTS_AWARDED' // C1: Sponsor points for referred purchase (+5000)
      ) {
        referralPoints += points;
      }
      // Base points (everything else)
      else {
        basePoints += points;
      }
    }

    // C1: Log final totals to verify REFERRAL_POINTS_AWARDED is included
    console.log('[POINTS_ROLLUP] Final totals', {
      userId,
      totalPoints,
      purchasePoints,
      referralPoints,
      basePoints,
      breakdownByType,
      referralPointsBreakdown: breakdownByType['REFERRAL_POINTS_AWARDED'] || 0,
    });

    return {
      totalPoints,
      purchasePoints,
      referralPoints,
      basePoints,
      breakdownByType,
    };
  } catch (error) {
    console.error('[POINTS_ROLLUP] Error calculating rollup', {
      error: error.message,
      userId,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Format points with thousands separator
 * @param {number} points - Points value to format
 * @returns {string} Formatted string (e.g., "1,500" or "10,000")
 */
function formatPoints(points) {
  if (typeof points !== 'number') {
    return String(points || 0);
  }
  return points.toLocaleString('en-US');
}

module.exports = {
  getPointsRollupForUser,
  formatPoints,
};
