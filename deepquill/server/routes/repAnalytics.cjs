const express = require('express');
const { prisma, ensureDatabaseUrl } = require('../prisma.cjs');
const {
  parseMonthRange,
  listActiveReps,
  buildDescendantMap,
  buildRepMetricsForRange,
  normalizeEmail,
} = require('../../lib/repAnalytics.cjs');

const router = express.Router();

function isAdmin(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

async function resolveRepFromRequest(req) {
  const repEmail = normalizeEmail(req.headers['x-user-email'] || req.query.repEmail || '');
  if (!repEmail) return null;
  return prisma.user.findUnique({
    where: { email: repEmail },
    select: {
      id: true,
      email: true,
      firstName: true,
      fname: true,
      referralCode: true,
      overrideEligible: true,
      overrideRepRole: true,
    },
  });
}

router.get('/reps/sales-ledger', async (req, res) => {
  try {
    ensureDatabaseUrl();
    if (!prisma) return res.status(500).json({ ok: false, error: 'database_unavailable' });
    const rep = await resolveRepFromRequest(req);
    if (!rep || !rep.overrideEligible || !['regional', 'podcaster'].includes(rep.overrideRepRole || '')) {
      return res.status(403).json({ ok: false, error: 'rep_forbidden' });
    }

    const range =
      parseMonthRange(req.query.month) ||
      (() => {
        const end = new Date();
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { start, end };
      })();

    const { descendantsOf } = await buildDescendantMap(prisma);
    const metrics = await buildRepMetricsForRange(prisma, rep, range, descendantsOf);

    const directRows = [];
    const downlineRows = [];
    const allPurchases = await prisma.purchase.findMany({
      where: {
        userId: { in: [rep.id, ...descendantsOf(rep.id)] },
        createdAt: { gte: range.start, lt: range.end },
      },
      select: {
        createdAt: true,
        userId: true,
        source: true,
        amount: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    for (const p of allPurchases) {
      const row = {
        date: p.createdAt.toISOString(),
        productSource: p.source || 'unknown',
        amountBand: Number(p.amount || 0) > 0 ? 'paid' : 'unknown',
      };
      if (p.userId === rep.id) directRows.push(row);
      else downlineRows.push(row);
    }

    return res.json({
      ok: true,
      rep: {
        id: rep.id,
        name: rep.firstName || rep.fname || rep.email,
        email: rep.email,
        role: rep.overrideRepRole,
        referralCode: rep.referralCode,
      },
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      summary: {
        directSales: metrics.directSalesCount,
        downlineSales: metrics.downlineSalesCount,
        directCommissionsCents: metrics.directCommissionsCents,
        overrideEarningsCents: metrics.overrideEarningsCents,
        totalEarnedCents: metrics.totalEarningsCents,
        totalPointsGenerated: metrics.totalPointsGenerated,
        conversionCount: metrics.conversionCount,
        referralCodePerformance: {
          code: metrics.referralCode,
          topPerformingLink: metrics.topPerformingLink,
        },
      },
      rows: {
        directSales: directRows,
        downlineSales: downlineRows,
      },
      privacy: {
        customerPaymentDetailsExposed: false,
        note: 'Rep-facing ledger intentionally omits customer email, Stripe session IDs, and payment instrument data.',
      },
    });
  } catch (err) {
    console.error('[reps/sales-ledger]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

router.get('/admin/reps/monthly-report', async (req, res) => {
  try {
    ensureDatabaseUrl();
    if (!prisma) return res.status(500).json({ ok: false, error: 'database_unavailable' });
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

    const now = new Date();
    const month =
      typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : now.toISOString().slice(0, 7);
    const range = parseMonthRange(month);
    if (!range) return res.status(400).json({ ok: false, error: 'invalid_month' });

    const prevStart = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() - 1, 1));
    const prevEnd = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));

    const reps = await listActiveReps(prisma);
    const { descendantsOf } = await buildDescendantMap(prisma);

    const current = await Promise.all(
      reps.map((rep) => buildRepMetricsForRange(prisma, rep, range, descendantsOf)),
    );
    const previous = await Promise.all(
      reps.map((rep) =>
        buildRepMetricsForRange(prisma, rep, { start: prevStart, end: prevEnd }, descendantsOf),
      ),
    );
    const prevById = new Map(previous.map((r) => [r.repId, r]));

    const ranked = [...current].sort((a, b) => b.totalEarningsCents - a.totalEarningsCents);
    const rows = ranked.map((r, idx) => {
      const prev = prevById.get(r.repId);
      const growth = (r.totalEarningsCents || 0) - (prev?.totalEarningsCents || 0);
      return {
        rep: r.repName,
        role: r.role,
        directSales: r.directSalesCount,
        downlineSales: r.downlineSalesCount,
        overrideEarningsCents: r.overrideEarningsCents,
        totalEarningsCents: r.totalEarningsCents,
        conversionCount: r.conversionCount,
        rank: idx + 1,
        topPerformingLink: r.topPerformingLink,
        bestSalesDay: r.bestSalesDay,
        monthlyGrowthCents: growth,
        leaderboardPosition: idx + 1,
      };
    });

    return res.json({
      ok: true,
      month,
      rows,
      note:
        'Monthly rep report compares active override reps by production metrics only (no customer payment details).',
      emailReady: {
        enabled: false,
        reason: 'monthly email dispatch not wired yet; payload is ready for cron/email integration',
      },
    });
  } catch (err) {
    console.error('[admin/reps/monthly-report]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

module.exports = router;

