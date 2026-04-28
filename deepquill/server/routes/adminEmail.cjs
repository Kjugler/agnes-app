// POST /api/admin/email/send — protected admin email (templates, dry-run, test, selected, all)
const express = require('express');
const { prisma } = require('../prisma.cjs');
const { runAdminEmailSend } = require('../../lib/email/adminEmailSend.cjs');

const router = express.Router();

function isAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

function hasValidAdminKey(req) {
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.use((req, res, next) => {
  if (!isAdminAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden - x-admin-key required in production' });
  }
  next();
});

router.post('/send', async (req, res) => {
  try {
    const out = await runAdminEmailSend(prisma, {
      ...(req.body || {}),
      adminAuthorized: hasValidAdminKey(req),
    });
    const status = out.ok === false ? 400 : 200;
    res.status(status).json(out);
  } catch (e) {
    console.error('[adminEmail] /send', e);
    res.status(500).json({
      ok: false,
      error: e.message || 'Internal error',
      mode: null,
      template: null,
      totalCandidates: 0,
      eligible: 0,
      skipped: {},
      sent: 0,
      failed: 0,
      resultsSummary: 'Request failed',
    });
  }
});

module.exports = router;
