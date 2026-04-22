/**
 * Dry-run by default: list orders before cutoff that still have shippedAt set
 * (accidental beta fulfillment during testing). Optional --apply clears shipment
 * and applies archived-beta flags so helper shipped-count / earnings match reality.
 *
 * Does not unsend emails — customers may have received incorrect shipment notices; handle in support.
 *
 * Usage (deepquill root):
 *   BETA_ARCHIVE_BEFORE=2026-04-15T00:00:00.000Z node scripts/revert-accidental-beta-shipments.cjs
 *   node scripts/revert-accidental-beta-shipments.cjs --before=2026-04-15T00:00:00.000Z --apply
 */

const path = require('path');
const deepquillRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(deepquillRoot, '.env.local'), override: false });
require('dotenv').config({ path: path.join(deepquillRoot, '.env'), override: false });

const { prisma, fulfillmentPrisma, ensureDatabaseUrl } = require('../server/prisma.cjs');
const { ARCHIVED_SALE_STATUS } = require('../lib/archivedBetaPurchases.cjs');

function parseArgs(argv) {
  let before = process.env.BETA_ARCHIVE_BEFORE || null;
  let apply = false;
  for (const a of argv.slice(2)) {
    if (a === '--apply') apply = true;
    else if (a.startsWith('--before=')) before = a.slice('--before='.length).trim();
  }
  return { before, apply };
}

async function main() {
  const { before, apply } = parseArgs(process.argv);
  if (!before) {
    console.error('Set BETA_ARCHIVE_BEFORE or --before=ISO8601');
    process.exit(1);
  }
  const cutoff = new Date(before);
  if (Number.isNaN(cutoff.getTime())) {
    console.error('Invalid date:', before);
    process.exit(1);
  }

  ensureDatabaseUrl();
  const fp = fulfillmentPrisma || prisma;
  if (!fp?.order?.findMany) {
    console.error('Prisma unavailable');
    process.exit(1);
  }

  const baseWhere = {
    createdAt: { lt: cutoff },
    shippedAt: { not: null },
  };

  const candidates = await fp.order.findMany({
    where: baseWhere,
    select: {
      id: true,
      stripeSessionId: true,
      createdAt: true,
      shippedAt: true,
      shippedById: true,
      status: true,
      saleStatus: true,
      labelPrintedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        cutoff: cutoff.toISOString(),
        candidateCount: candidates.length,
        orders: candidates,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log(
      'Dry run only. Re-run with --apply to clear shippedAt/shippedById, set archived-beta flags, and set status to label_printed (if label was printed) or pending.'
    );
    await prisma.$disconnect();
    if (fulfillmentPrisma && fulfillmentPrisma !== prisma) await fulfillmentPrisma.$disconnect();
    return;
  }

  const common = {
    saleStatus: ARCHIVED_SALE_STATUS,
    fulfillmentStatus: 'none',
    countsForShipping: false,
    countsForPoints: false,
    shippedAt: null,
    shippedById: null,
    reservedAt: null,
    reservedById: null,
  };

  const withLabel = await fp.order.updateMany({
    where: { ...baseWhere, labelPrintedAt: { not: null } },
    data: { ...common, status: 'label_printed' },
  });
  const noLabel = await fp.order.updateMany({
    where: { ...baseWhere, labelPrintedAt: null },
    data: { ...common, status: 'pending' },
  });

  console.log(
    JSON.stringify({
      applied: true,
      updatedWithLabelPrinted: withLabel.count,
      updatedPending: noLabel.count,
      total: withLabel.count + noLabel.count,
    })
  );

  await prisma.$disconnect();
  if (fulfillmentPrisma && fulfillmentPrisma !== prisma) await fulfillmentPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
