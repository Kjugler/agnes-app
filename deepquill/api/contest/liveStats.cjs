// deepquill/api/contest/liveStats.cjs
// Read-only aggregate metrics for Contest Hub "Rock Concert Mode"
// Leader uses ledger rollup (excludes archived-beta sessions). booksClaimed uses production Purchase rows only.

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { resolveLiveLeader } = require('../../lib/dailyContestSummary.cjs');
const { wherePurchaseCountsForProductionMetrics } = require('../../lib/archivedBetaPurchases.cjs');

async function handleLiveStats(req, res) {
  try {
    ensureDatabaseUrl();

    // Leader: top user by ledger rollup (canonical; excludes archived-beta checkout sessions)
    const liveLeader = await resolveLiveLeader(prisma);

    // Contest participants (users who joined)
    const playersCount = await prisma.user.count({
      where: { contestJoinedAt: { not: null } },
    });

    // Friends saved: sum of associateFriendsSavedCents
    const friendsSavedAgg = await prisma.user.aggregate({
      _sum: { associateFriendsSavedCents: true },
      where: { associateFriendsSavedCents: { gt: 0 } },
    });
    const friendsSavedCents = friendsSavedAgg._sum.associateFriendsSavedCents || 0;

    // Associate rewards: sum of associateLifetimeEarnedCents
    const associateRewardsAgg = await prisma.user.aggregate({
      _sum: { associateLifetimeEarnedCents: true },
      where: { associateLifetimeEarnedCents: { gt: 0 } },
    });
    const associateRewardsCents = associateRewardsAgg._sum.associateLifetimeEarnedCents || 0;

    // Books claimed: live / production purchases only (excludes archived beta)
    const booksClaimed = await prisma.purchase.count({
      where: wherePurchaseCountsForProductionMetrics(),
    });

    const leaderName =
      liveLeader.displayName && liveLeader.totalPoints > 0
        ? liveLeader.displayName
        : null;
    const leaderPoints = liveLeader.totalPoints > 0 ? liveLeader.totalPoints : 0;

    return res.json({
      ok: true,
      playersExploring: playersCount,
      currentLeaderName: leaderName,
      currentLeaderPoints: leaderPoints,
      friendsSavedCents,
      associateRewardsCents,
      booksClaimed,
    });
  } catch (err) {
    console.error('[contest/live-stats] error', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch live stats' });
  }
}

module.exports = handleLiveStats;
