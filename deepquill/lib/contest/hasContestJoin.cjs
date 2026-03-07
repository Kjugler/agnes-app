// deepquill/lib/contest/hasContestJoin.cjs
// B1: Helper to check if user has joined contest (ledger-driven, single source of truth)

const { ensureDatabaseUrl } = require('../../server/prisma.cjs');

/**
 * Check if user has joined the contest (ledger-driven)
 * B1: Uses ledger CONTEST_JOIN entry as single source of truth
 * @param {Object} prismaClient - Prisma client instance
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} true if user has CONTEST_JOIN ledger entry
 */
async function hasContestJoin(prismaClient, userId) {
  if (!prismaClient) {
    throw new Error('[hasContestJoin] prismaClient is required');
  }
  if (!userId) {
    return false;
  }

  try {
    ensureDatabaseUrl();

    const joinLedger = await prismaClient.ledger.findFirst({
      where: {
        userId,
        type: 'CONTEST_JOIN',
        currency: 'points',
        points: { gt: 0 }, // B1: Only count entries with positive points
      },
      select: { id: true },
    });

    return Boolean(joinLedger);
  } catch (error) {
    console.error('[hasContestJoin] Error checking contest join', {
      error: error.message,
      userId,
      stack: error.stack,
    });
    return false; // Default to false on error
  }
}

module.exports = { hasContestJoin };
