// PATCH /api/admin/contest/daily-summary/:summaryDate
// Regenerate: POST /api/admin/contest/daily-summary/regenerate

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { ensureDatabaseUrl } = require('../prisma.cjs');
const {
  runDailyContestSummary,
  toPublicSummaryDto,
  recordDailyContestSummaryJobRun,
  getDailyContestSummaryJobStatus,
} = require('../../lib/dailyContestSummary.cjs');

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

router.get('/daily-summary/job-status', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const jobStatus = await getDailyContestSummaryJobStatus(prisma);
    return res.json({ ok: true, jobStatus });
  } catch (err) {
    console.error('[admin/contest] job-status', err);
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

router.post('/daily-summary/regenerate', express.json(), async (req, res) => {
  try {
    ensureDatabaseUrl();
    const date =
      (typeof req.body?.summaryDate === 'string' && req.body.summaryDate.trim()) ||
      (typeof req.query?.date === 'string' && req.query.date.trim()) ||
      undefined;
    const result = await runDailyContestSummary(prisma, { summaryDate: date });
    await recordDailyContestSummaryJobRun(prisma, { success: true });
    return res.json({
      ok: true,
      summary: toPublicSummaryDto(result.summary),
      summaryDate: result.summaryDate,
      placement: result.placement,
      jobStatus: await getDailyContestSummaryJobStatus(prisma),
    });
  } catch (err) {
    console.error('[admin/contest] regenerate', err);
    try {
      await recordDailyContestSummaryJobRun(prisma, {
        success: false,
        errorMessage: err?.message || 'server_error',
      });
    } catch (e2) {
      console.error('[admin/contest] regenerate job-status', e2);
    }
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

router.patch('/daily-summary/:summaryDate', express.json(), async (req, res) => {
  try {
    ensureDatabaseUrl();
    const summaryDate = req.params.summaryDate;
    const b = req.body || {};

    const existing = await prisma.dailyContestSummary.findUnique({
      where: { summaryDate },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const data = {
      manuallyEditedNames: true,
    };
    if (typeof b.firstDisplayOverride === 'string') data.firstDisplayOverride = b.firstDisplayOverride.trim() || null;
    if (typeof b.secondDisplayOverride === 'string') data.secondDisplayOverride = b.secondDisplayOverride.trim() || null;
    if (typeof b.thirdDisplayOverride === 'string') data.thirdDisplayOverride = b.thirdDisplayOverride.trim() || null;
    if (typeof b.cashChallengeWinnerDisplayName === 'string') {
      data.cashChallengeWinnerDisplayName = b.cashChallengeWinnerDisplayName.trim() || null;
    }
    if (typeof b.cashChallengeWinnerUserId === 'string') {
      data.cashChallengeWinnerUserId = b.cashChallengeWinnerUserId.trim() || null;
    }
    if (typeof b.cashChallengeClaimInstructions === 'string') {
      data.cashChallengeClaimInstructions = b.cashChallengeClaimInstructions.trim() || null;
    }
    if (typeof b.cashChallengeClaimed === 'boolean') {
      data.cashChallengeClaimed = b.cashChallengeClaimed;
    }

    const updated = await prisma.dailyContestSummary.update({
      where: { summaryDate },
      data,
    });
    return res.json({ ok: true, summary: toPublicSummaryDto(updated) });
  } catch (err) {
    console.error('[admin/contest] patch', err);
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

router.get('/daily-summary/:summaryDate', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const row = await prisma.dailyContestSummary.findUnique({
      where: { summaryDate: req.params.summaryDate },
    });
    if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, summary: toPublicSummaryDto(row), raw: row });
  } catch (err) {
    console.error('[admin/contest] get', err);
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

module.exports = router;
