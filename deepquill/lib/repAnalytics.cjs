const { normalizeEmail } = require('../src/lib/normalize.cjs');

function parseMonthRange(month) {
  const m = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const start = new Date(`${m}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function toYmd(d) {
  return d.toISOString().slice(0, 10);
}

async function listActiveReps(prisma) {
  return prisma.user.findMany({
    where: {
      overrideEligible: true,
      overrideRepRole: { in: ['regional', 'podcaster'] },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      fname: true,
      referralCode: true,
      overrideRepRole: true,
    },
    orderBy: { email: 'asc' },
  });
}

async function buildDescendantMap(prisma) {
  const users = await prisma.user.findMany({
    select: { id: true, lastReferredByUserId: true },
  });
  const children = new Map();
  for (const u of users) {
    const parent = u.lastReferredByUserId || null;
    if (!parent) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(u.id);
  }
  function descendantsOf(rootId) {
    const out = new Set();
    const q = [...(children.get(rootId) || [])];
    while (q.length) {
      const id = q.shift();
      if (!id || out.has(id)) continue;
      out.add(id);
      const c = children.get(id) || [];
      for (const cid of c) q.push(cid);
    }
    return out;
  }
  return { descendantsOf };
}

function sumLedgerCents(rows, predicate) {
  return rows.reduce((sum, r) => {
    if (!predicate(r)) return sum;
    return sum + Number(r.amount || 0);
  }, 0);
}

function isDirectCommission(row) {
  return row.type === 'REFERRAL_COMMISSION_EARNED' && row.meta?.payoutKind === 'direct';
}

function isOverrideCommission(row) {
  return (
    row.type === 'REFERRAL_COMMISSION_EARNED' &&
    String(row.meta?.payoutKind || '').includes('override')
  );
}

async function buildRepMetricsForRange(prisma, rep, range, descendantsOf) {
  const descendants = descendantsOf(rep.id);
  const ids = [rep.id, ...descendants];

  const [purchases, ledgerRows, conversions] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        userId: { in: ids },
        createdAt: { gte: range.start, lt: range.end },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        createdAt: true,
        saleStatus: true,
        source: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ledger.findMany({
      where: {
        userId: rep.id,
        createdAt: { gte: range.start, lt: range.end },
      },
      select: {
        type: true,
        amount: true,
        createdAt: true,
        meta: true,
      },
    }),
    prisma.referralConversion.findMany({
      where: {
        referrerUserId: rep.id,
        createdAt: { gte: range.start, lt: range.end },
      },
      select: { id: true, createdAt: true },
    }),
  ]);

  const directSales = purchases.filter((p) => p.userId === rep.id);
  const downlineSales = purchases.filter((p) => p.userId !== rep.id);

  const directCommissionCents = sumLedgerCents(ledgerRows, isDirectCommission);
  const overrideEarningsCents = sumLedgerCents(ledgerRows, isOverrideCommission);
  const totalEarningsCents = directCommissionCents + overrideEarningsCents;
  const totalPointsGenerated = (directSales.length + downlineSales.length) * 5000;

  const daily = new Map();
  for (const p of purchases) {
    const day = toYmd(p.createdAt);
    daily.set(day, (daily.get(day) || 0) + 1);
  }
  let bestSalesDay = null;
  let bestSalesDayCount = 0;
  for (const [day, cnt] of daily.entries()) {
    if (cnt > bestSalesDayCount) {
      bestSalesDay = day;
      bestSalesDayCount = cnt;
    }
  }

  const code = rep.referralCode || '';
  const topPerformingLink = code
    ? `https://www.theagnesprotocol.com/start?ref=${encodeURIComponent(code)}`
    : null;

  return {
    repId: rep.id,
    repEmail: rep.email,
    repName: rep.firstName || rep.fname || rep.email,
    role: rep.overrideRepRole,
    referralCode: rep.referralCode || '',
    topPerformingLink,
    directSalesCount: directSales.length,
    downlineSalesCount: downlineSales.length,
    directCommissionsCents: directCommissionCents,
    overrideEarningsCents,
    totalEarningsCents,
    conversionCount: conversions.length,
    totalPointsGenerated,
    bestSalesDay,
    bestSalesDayCount,
    ledgerRows,
  };
}

module.exports = {
  parseMonthRange,
  listActiveReps,
  buildDescendantMap,
  buildRepMetricsForRange,
  normalizeEmail,
};

