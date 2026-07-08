#!/usr/bin/env node
/**
 * Send a Reader Recommendation outreach batch (dry-run or live).
 *
 * Examples:
 *   node scripts/send-reader-recommendation-batch.cjs --dry-run
 *   node scripts/send-reader-recommendation-batch.cjs --live --batch "Recommendation Email Batch 2"
 *
 * Defaults: Batch 2 label, current template, 10 recipients, purchasers only, exclude prior batches.
 */

const { prisma } = require('../server/prisma.cjs');
const { runReaderRecommendationOutreach } = require('../lib/email/runReaderRecommendationOutreach.cjs');
const {
  BATCH_2_LABEL,
  TEMPLATE_CURRENT,
  DEFAULT_BATCH_SIZE,
} = require('../lib/email/readerRecommendationOutreachConfig.cjs');

function parseArgs(argv) {
  const opts = {
    dryRun: true,
    limit: DEFAULT_BATCH_SIZE,
    batch: BATCH_2_LABEL,
    template: TEMPLATE_CURRENT,
    requirePurchase: true,
    excludePreviousBatches: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--live' || arg === '--no-dry-run') {
      opts.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (arg === '--all-readers') {
      opts.requirePurchase = false;
      continue;
    }
    if (arg === '--include-previous') {
      opts.excludePreviousBatches = false;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      opts.limit = parseInt(argv[++i], 10);
      continue;
    }
    if (arg === '--batch' && argv[i + 1]) {
      opts.batch = argv[++i];
      continue;
    }
    if (arg === '--template' && argv[i + 1]) {
      opts.template = argv[++i];
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
Reader Recommendation batch sender

Usage:
  node scripts/send-reader-recommendation-batch.cjs [options]

Options:
  --dry-run              Preview recipients (default)
  --live                 Send emails (requires TRANSACTIONAL_EMAIL_ENABLED=1)
  --limit N              Batch size (default ${DEFAULT_BATCH_SIZE})
  --batch LABEL          Batch label stored on User (default "${BATCH_2_LABEL}")
  --template ID          batch_1 | current (default current)
  --all-readers          Do not require a Purchase record
  --include-previous     Include users already sent a prior batch
  -h, --help             Show this help

Production Batch 2 (recommended):
  node scripts/send-reader-recommendation-batch.cjs --dry-run
  node scripts/send-reader-recommendation-batch.cjs --live
`);
}

(async () => {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const result = await runReaderRecommendationOutreach(prisma, {
    dryRun: opts.dryRun,
    limit: opts.limit,
    batch: opts.batch,
    template: opts.template,
    requirePurchase: opts.requirePurchase,
    excludePreviousBatches: opts.excludePreviousBatches,
  });

  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();

  if (!result.ok) process.exit(1);
  if (result.transactionalDisabled) process.exit(2);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
