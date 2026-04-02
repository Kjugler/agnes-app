// GET /api/contest/daily-summary
// Public read: latest or ?date=YYYY-MM-DD (America/Denver summary key)

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { toPublicSummaryDto, ribbonLineFromSummary } = require('../../lib/dailyContestSummary.cjs');

async function handleContestDailySummary(req, res) {
  try {
    ensureDatabaseUrl();
    const date = typeof req.query?.date === 'string' ? req.query.date.trim() : null;

    if (date) {
      const row = await prisma.dailyContestSummary.findUnique({
        where: { summaryDate: date },
      });
      if (!row) {
        return res.status(404).json({ ok: false, error: 'not_found', summaryDate: date });
      }
      return res.json({
        ok: true,
        summary: toPublicSummaryDto(row),
        ribbonLine: ribbonLineFromSummary(row),
      });
    }

    const row = await prisma.dailyContestSummary.findFirst({
      orderBy: { summaryDate: 'desc' },
    });
    if (!row) {
      return res.json({ ok: true, summary: null, ribbonLine: null });
    }
    return res.json({
      ok: true,
      summary: toPublicSummaryDto(row),
      ribbonLine: ribbonLineFromSummary(row),
    });
  } catch (err) {
    console.error('[contest/daily-summary] Error', err);
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
}

module.exports = handleContestDailySummary;
