/**
 * Mark beta-era purchases and matching fulfillment orders as archived (no deletes).
 * Sets saleStatus=archived_beta, fulfillmentStatus=none, countsForShipping/Points=false,
 * and clears Order reservation fields.
 *
 * Usage (from deepquill root):
 *   BETA_ARCHIVE_BEFORE=2026-04-15T00:00:00.000Z node scripts/archive-beta-sales.cjs
 *   node scripts/archive-beta-sales.cjs --before=2026-04-15T00:00:00.000Z
 *   node scripts/archive-beta-sales.cjs --dry-run --before=2026-04-15T00:00:00.000Z
 *
 * Does not modify User, ReferralConversion, or discount-code fields.
 */

const path = require('path');

const deepquillRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(deepquillRoot, '.env.local'), override: false });
require('dotenv').config({ path: path.join(deepquillRoot, '.env'), override: false });

const { prisma, fulfillmentPrisma, ensureDatabaseUrl } = require('../server/prisma.cjs');
const { ARCHIVED_SALE_STATUS } = require('../lib/archivedBetaPurchases.cjs');
const { runArchiveBetaSales } = require('../lib/runArchiveBetaSales.cjs');

function parseArgs(argv) {
  let before = process.env.BETA_ARCHIVE_BEFORE || null;
  let dryRun = false;
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--before=')) before = a.slice('--before='.length).trim();
  }
  return { before, dryRun };
}

async function main() {
  const { before, dryRun } = parseArgs(process.argv);
  if (!before) {
    console.error(
      'Missing cutoff: set BETA_ARCHIVE_BEFORE or pass --before=ISO8601 (e.g. 2026-04-15T00:00:00.000Z)'
    );
    process.exit(1);
  }
  const cutoff = new Date(before);
  if (Number.isNaN(cutoff.getTime())) {
    console.error('Invalid --before / BETA_ARCHIVE_BEFORE date:', before);
    process.exit(1);
  }

  ensureDatabaseUrl();
  if (!prisma) {
    console.error('Prisma not available');
    process.exit(1);
  }

  const summary = await runArchiveBetaSales({
    prisma,
    fulfillmentPrisma,
    cutoff,
    dryRun,
  });

  console.log(
    JSON.stringify({
      dryRun: summary.dryRun,
      cutoff: summary.cutoff,
      purchaseCandidates: summary.purchaseCandidates,
      distinctStripeSessions: summary.distinctStripeSessions,
      fulfillmentDbSplit: summary.fulfillmentDbSplit,
      purchasesUpdated: summary.purchasesUpdated,
      ordersUpdated: summary.ordersUpdated,
    })
  );

  if (dryRun && summary.purchaseCandidates > 0) {
    const sample = await prisma.purchase.findMany({
      where: {
        createdAt: { lt: cutoff },
        saleStatus: { not: ARCHIVED_SALE_STATUS },
      },
      select: { id: true, sessionId: true, userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    console.log('Dry run: no updates. Sample (up to 5):', sample);
  }

  await prisma.$disconnect();
  if (fulfillmentPrisma && fulfillmentPrisma !== prisma) {
    await fulfillmentPrisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
