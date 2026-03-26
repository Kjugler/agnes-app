// deepquill/lib/rabbit.cjs
// Canonical rabbit progression mechanic - target calculation, state, rewards

const RANK_STEP = 500;

function calcNextRankThreshold(points) {
  const bands = Math.floor(points / RANK_STEP);
  return (bands + 1) * RANK_STEP;
}

function calcInitialRabbitTarget(points) {
  const nextRank = calcNextRankThreshold(points);
  const base = points + 250;
  return Math.min(nextRank, base);
}

/**
 * Ensure rabbit state is correct for user. Updates User.rabbitTarget, User.rabbitSeq if needed.
 * @param {Object} prisma - Prisma client
 * @param {Object} user - { id, points, rabbitTarget, rabbitSeq }
 * @param {number} [canonicalPoints] - Optional override for points (e.g. from ledger rollup)
 * @returns {{ user: Object, nextRankThreshold: number }}
 */
async function ensureRabbitState(prisma, user, canonicalPoints) {
  const points = canonicalPoints != null ? canonicalPoints : (user.points ?? 0);
  const nextRankThreshold = calcNextRankThreshold(points);
  const target =
    user.rabbitTarget != null && user.rabbitTarget > points
      ? user.rabbitTarget
      : calcInitialRabbitTarget(points);
  const seq = user.rabbitSeq != null && user.rabbitSeq > 0 ? user.rabbitSeq : 1;

  if (target !== user.rabbitTarget || seq !== user.rabbitSeq) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitTarget: target,
        rabbitSeq: seq,
      },
      select: {
        id: true,
        points: true,
        rabbitTarget: true,
        rabbitSeq: true,
      },
    });
    return { user: updated, nextRankThreshold };
  }

  return {
    user: {
      id: user.id,
      points: user.points,
      rabbitTarget: user.rabbitTarget,
      rabbitSeq: user.rabbitSeq,
    },
    nextRankThreshold,
  };
}

module.exports = {
  RANK_STEP,
  calcNextRankThreshold,
  calcInitialRabbitTarget,
  ensureRabbitState,
};
