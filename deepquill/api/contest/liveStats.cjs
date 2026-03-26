// deepquill/api/contest/liveStats.cjs
// Read-only aggregate metrics for Contest Hub "Rock Concert Mode"
// No schema changes. Uses existing User, Purchase, Ledger.

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');

async function handleLiveStats(req, res) {
  try {
    ensureDatabaseUrl();

    // Leader: top user by points (has at least 1 point)
    const leader = await prisma.user.findFirst({
      where: { points: { gt: 0 } },
      orderBy: { points: 'desc' },
      select: {
        firstName: true,
        fname: true,
        points: true,
      },
    });

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

    // Books claimed: Purchase count
    const booksClaimed = await prisma.purchase.count();

    const leaderName = leader
      ? (leader.firstName || leader.fname || 'Anonymous').trim() || 'Anonymous'
      : null;
    const leaderPoints = leader?.points ?? 0;

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
