// TEMPORARY: POST /api/admin/ops/archive-beta-sales-once — one-time Railway production beta archive.
// Remove or disable this router after production run. Requires x-admin-key === ADMIN_KEY (always; no dev bypass).

const express = require('express');
const { prisma, fulfillmentPrisma, ensureDatabaseUrl } = require('../prisma.cjs');
const { runArchiveBetaSales } = require('../../lib/runArchiveBetaSales.cjs');

const router = express.Router();

/** Fixed go-live cutoff (must match operator plan). */
const PRODUCTION_BETA_ARCHIVE_CUTOFF = new Date('2026-04-15T00:00:00.000Z');

router.use((req, res, next) => {
  if (!process.env.ADMIN_KEY) {
    return res.status(503).json({ ok: false, error: 'admin_not_configured' });
  }
  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
});

router.post('/archive-beta-sales-once', async (req, res) => {
  try {
    ensureDatabaseUrl();
    if (!prisma) {
      return res.status(500).json({ ok: false, error: 'database_unavailable' });
    }

    const summary = await runArchiveBetaSales({
      prisma,
      fulfillmentPrisma,
      cutoff: PRODUCTION_BETA_ARCHIVE_CUTOFF,
      dryRun: false,
    });

    console.log(
      '[admin/archive-beta-sales-once]',
      JSON.stringify({
        purchaseCandidates: summary.purchaseCandidates,
        purchasesUpdated: summary.purchasesUpdated,
        ordersUpdated: summary.ordersUpdated,
        cutoff: summary.cutoff,
      })
    );

    return res.json({
      ok: true,
      operation: 'archive_beta_sales',
      temporary: true,
      ...summary,
    });
  } catch (err) {
    console.error('[admin/archive-beta-sales-once]', err);
    return res.status(500).json({
      ok: false,
      error: 'archive_failed',
      message: err?.message || String(err),
    });
  }
});

module.exports = router;
