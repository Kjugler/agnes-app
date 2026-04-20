/**
 * Stripe checkout session ids whose ledger rows are excluded from contest rollups
 * (archived beta purchases and tied checkout-side ledger).
 */

const ARCHIVED_SALE_STATUS = 'archived_beta';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Set<string>>}
 */
async function getExcludedStripeSessionIdsForPointsRollup(prisma) {
  if (!prisma?.purchase?.findMany) {
    return new Set();
  }
  const rows = await prisma.purchase.findMany({
    where: {
      OR: [{ saleStatus: ARCHIVED_SALE_STATUS }, { countsForPoints: false }],
    },
    select: { sessionId: true },
  });
  return new Set(rows.map((r) => r.sessionId).filter(Boolean));
}

/** Prisma where clause: purchases that count as live catalog / contest books sold. */
function wherePurchaseCountsForProductionMetrics() {
  return {
    saleStatus: { not: ARCHIVED_SALE_STATUS },
    countsForPoints: true,
  };
}

module.exports = {
  ARCHIVED_SALE_STATUS,
  getExcludedStripeSessionIdsForPointsRollup,
  wherePurchaseCountsForProductionMetrics,
};
