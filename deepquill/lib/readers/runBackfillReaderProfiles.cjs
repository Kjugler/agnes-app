const { ARCHIVED_SALE_STATUS } = require('../archivedBetaPurchases.cjs');
const { ensureReaderProfileFromPurchase, resolveProductForSession } = require('./ensureReaderProfileFromPurchase.cjs');

function emptyStats() {
  return {
    candidates: 0,
    purchasesProcessed: 0,
    created: 0,
    updated: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
    skipped: {
      already_logged: 0,
      non_mailable_email: 0,
      example_email: 0,
      fulfillment_staff: 0,
      user_not_found: 0,
      no_purchases: 0,
      other: 0,
    },
    errors: [],
  };
}

function bumpSkip(stats, reason) {
  if (stats.skipped[reason] !== undefined) {
    stats.skipped[reason] += 1;
  } else {
    stats.skipped.other += 1;
  }
}

/**
 * One-time (or repeatable) backfill: ReaderProfile for users with Purchase rows only.
 * Excludes contest-only users by requiring at least one purchase.
 *
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {boolean} [params.dryRun]
 * @param {boolean} [params.includeArchivedBeta] — default false (live catalog purchases only)
 */
async function runBackfillReaderProfiles({ prisma, dryRun = true, includeArchivedBeta = false }) {
  if (!prisma) {
    throw new Error('runBackfillReaderProfiles: prisma is required');
  }

  const stats = emptyStats();

  const purchaseWhere = {};
  if (!includeArchivedBeta) {
    purchaseWhere.saleStatus = { not: ARCHIVED_SALE_STATUS };
  }

  const purchases = await prisma.purchase.findMany({
    where: purchaseWhere,
    select: {
      id: true,
      userId: true,
      sessionId: true,
      createdAt: true,
      saleStatus: true,
    },
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
  });

  const userIds = [...new Set(purchases.map((p) => p.userId).filter(Boolean))];
  stats.candidates = userIds.length;

  const productCache = new Map();

  for (const purchase of purchases) {
    if (!purchase.userId || !purchase.sessionId) continue;

    stats.purchasesProcessed += 1;

    let product = productCache.get(purchase.sessionId);
    if (product === undefined) {
      product = await resolveProductForSession(prisma, purchase.sessionId);
      productCache.set(purchase.sessionId, product);
    }

    try {
      const result = await ensureReaderProfileFromPurchase(prisma, {
        userId: purchase.userId,
        sessionId: purchase.sessionId,
        product,
        purchasedAt: purchase.createdAt,
        saleStatus: purchase.saleStatus,
        dryRun,
      });

      switch (result.action) {
        case 'created':
          stats.created += 1;
          break;
        case 'updated':
          stats.updated += 1;
          break;
        case 'would_create':
          stats.wouldCreate += 1;
          break;
        case 'would_update':
          stats.wouldUpdate += 1;
          break;
        case 'skipped':
          bumpSkip(stats, result.reason || 'other');
          break;
        default:
          stats.skipped.other += 1;
      }
    } catch (err) {
      stats.errors.push({
        userId: purchase.userId,
        sessionId: purchase.sessionId,
        error: err?.message || String(err),
      });
    }
  }

  return {
    dryRun,
    includeArchivedBeta,
    ...stats,
  };
}

module.exports = {
  runBackfillReaderProfiles,
};
