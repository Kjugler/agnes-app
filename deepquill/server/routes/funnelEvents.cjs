// Funnel event ingestion + admin report (first-party Event table).

const express = require('express');
const { prisma, ensureDatabaseUrl } = require('../prisma.cjs');
const { recordFunnelEvent } = require('../../lib/funnel/recordFunnelEvent.cjs');
const { buildFunnelReport, parseDay } = require('../../lib/funnel/buildFunnelReport.cjs');
const { buildContentReport } = require('../../lib/funnel/buildContentReport.cjs');

const router = express.Router();

function isAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.post('/event', express.json(), async (req, res) => {
  try {
    ensureDatabaseUrl();
    if (!prisma) {
      return res.status(500).json({ ok: false, error: 'database_unavailable' });
    }

    const body = req.body || {};
    const type = body.type;
    const visitorId = body.visitorId ? String(body.visitorId).slice(0, 64) : null;
    const userId = body.userId ? String(body.userId).slice(0, 64) : null;
    const ref = body.ref ? String(body.ref).slice(0, 64) : null;
    const path = body.path ? String(body.path).slice(0, 512) : null;
    const source = body.source ? String(body.source).slice(0, 128) : null;
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};

    const result = await recordFunnelEvent(prisma, {
      type,
      visitorId,
      userId,
      ref,
      path,
      source,
      meta,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[funnel/event]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'unknown_error' });
  }
});

router.get('/funnel-report', async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  try {
    ensureDatabaseUrl();
    if (!prisma) {
      return res.status(500).json({ ok: false, error: 'database_unavailable' });
    }

    const q = req.query || {};
    const now = new Date();
    const end = q.end != null && q.end !== '' ? parseDay(String(q.end), 'end') : now;
    const start =
      q.start != null && q.start !== ''
        ? parseDay(String(q.start), 'start')
        : new Date((end || now).getTime() - 30 * 24 * 60 * 60 * 1000);

    const report = await buildFunnelReport(prisma, { start, end: end || now });
    return res.json(report);
  } catch (err) {
    console.error('[admin/funnel-report]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'unknown_error' });
  }
});

router.get('/content-report', async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  try {
    ensureDatabaseUrl();
    if (!prisma) {
      return res.status(500).json({ ok: false, error: 'database_unavailable' });
    }

    const q = req.query || {};
    const now = new Date();
    const end = q.end != null && q.end !== '' ? parseDay(String(q.end), 'end') : now;
    const start =
      q.start != null && q.start !== ''
        ? parseDay(String(q.start), 'start')
        : new Date((end || now).getTime() - 30 * 24 * 60 * 60 * 1000);

    const report = await buildContentReport(prisma, { start, end: end || now });
    return res.json(report);
  } catch (err) {
    console.error('[admin/content-report]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'unknown_error' });
  }
});

module.exports = router;
