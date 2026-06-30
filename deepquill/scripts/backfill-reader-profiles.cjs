#!/usr/bin/env node
/**
 * CLI: backfill ReaderProfile for purchasers.
 * Usage:
 *   node scripts/backfill-reader-profiles.cjs --dry-run
 *   node scripts/backfill-reader-profiles.cjs --live
 *   node scripts/backfill-reader-profiles.cjs --live --include-archived-beta
 */

const path = require('path');
const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');
const { runBackfillReaderProfiles } = require('../lib/readers/runBackfillReaderProfiles.cjs');

async function main() {
  ensureDatabaseUrl();
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const dryRun = !live || args.includes('--dry-run');
  const includeArchivedBeta = args.includes('--include-archived-beta');

  const summary = await runBackfillReaderProfiles({
    prisma,
    dryRun,
    includeArchivedBeta,
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
