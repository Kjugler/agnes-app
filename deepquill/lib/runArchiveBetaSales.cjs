/**
 * Shared beta archive (Purchase + Order). Used by scripts/archive-beta-sales.cjs and admin HTTP route.
 * Does not disconnect Prisma clients (callers own lifecycle).
 */

const { ARCHIVED_SALE_STATUS } = require('./archivedBetaPurchases.cjs');

/**
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {import('@prisma/client').PrismaClient} params.fulfillmentPrisma
 * @param {Date} params.cutoff
 * @param {boolean} [params.dryRun]
 * @returns {Promise<{
 *   cutoff: string,
 *   dryRun: boolean,
 *   purchaseCandidates: number,
 *   distinctStripeSessions: number,
 *   fulfillmentDbSplit: 'separate' | 'same_as_main',
 *   purchasesUpdated: number,
 *   ordersUpdated: number,
 * }>}
 */
async function runArchiveBetaSales({ prisma, fulfillmentPrisma, cutoff, dryRun = false }) {
  if (!prisma) {
    throw new Error('runArchiveBetaSales: prisma is required');
  }
  const fp = fulfillmentPrisma || prisma;

  const purchaseWhere = {
    createdAt: { lt: cutoff },
    saleStatus: { not: ARCHIVED_SALE_STATUS },
  };

  const candidates = await prisma.purchase.findMany({
    where: purchaseWhere,
    select: { id: true, sessionId: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const sessionIds = [...new Set(candidates.map((p) => p.sessionId).filter(Boolean))];

  const base = {
    cutoff: cutoff.toISOString(),
    dryRun,
    purchaseCandidates: candidates.length,
    distinctStripeSessions: sessionIds.length,
    fulfillmentDbSplit: fp !== prisma ? 'separate' : 'same_as_main',
    purchasesUpdated: 0,
    ordersUpdated: 0,
  };

  if (dryRun) {
    return base;
  }

  const archiveData = {
    saleStatus: ARCHIVED_SALE_STATUS,
    fulfillmentStatus: 'none',
    countsForShipping: false,
    countsForPoints: false,
  };

  const orderData = {
    ...archiveData,
    reservedAt: null,
    reservedById: null,
  };

  let purchaseResult;
  let orderUpdated = 0;

  if (fp === prisma) {
    const ops = [
      prisma.purchase.updateMany({
        where: purchaseWhere,
        data: archiveData,
      }),
    ];
    if (sessionIds.length) {
      ops.push(
        prisma.order.updateMany({
          where: { stripeSessionId: { in: sessionIds } },
          data: orderData,
        })
      );
    }
    const results = await prisma.$transaction(ops);
    purchaseResult = results[0];
    if (results[1]) orderUpdated = results[1].count;
  } else {
    purchaseResult = await prisma.purchase.updateMany({
      where: purchaseWhere,
      data: archiveData,
    });
    if (sessionIds.length) {
      const o = await fp.order.updateMany({
        where: { stripeSessionId: { in: sessionIds } },
        data: orderData,
      });
      orderUpdated = o.count;
    }
  }

  // Catch Orders before cutoff that were never tied to a Purchase row (or session drift),
  // and any session-matched rows already updated count as 0 here.
  const orderByCutoffWhere = {
    createdAt: { lt: cutoff },
    saleStatus: { not: ARCHIVED_SALE_STATUS },
  };
  const supplemental = await fp.order.updateMany({
    where: orderByCutoffWhere,
    data: orderData,
  });
  orderUpdated += supplemental.count;

  return {
    ...base,
    purchasesUpdated: purchaseResult.count,
    ordersUpdated: orderUpdated,
  };
}

module.exports = { runArchiveBetaSales };
