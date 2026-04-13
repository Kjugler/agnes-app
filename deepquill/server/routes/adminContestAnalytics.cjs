// GET /api/admin/contest/analytics — contest/user visibility (admin + x-admin-key)

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { ensureDatabaseUrl } = require('../prisma.cjs');
const { getContestAdminReport } = require('../../lib/contestAdminReport.cjs');

const router = express.Router();

function isContestAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.use((req, res, next) => {
  if (!isContestAdminAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
});

router.get('/analytics', async (req, res) => {
  try {
    ensureDatabaseUrl();
    if (!prisma) {
      return res.status(500).json({ ok: false, error: 'database_unavailable' });
    }

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const contestOnly =
      req.query.contestOnly === '1' ||
      req.query.contestOnly === 'true' ||
      req.query.contest === '1';
    const topN = parseInt(String(req.query.top ?? '20'), 10);

    const report = await getContestAdminReport(prisma, {
      q,
      contestOnly,
      topN: Number.isFinite(topN) ? topN : 20,
    });

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      ...report,
    });
  } catch (err) {
    console.error('[admin/contest/analytics]', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'server_error',
    });
  }
});

module.exports = router;
