/**
 * Contest admin analytics (read-only). Used by GET /api/admin/contest/analytics.
 */

const { getPointsRollupForUser } = require('./pointsRollup.cjs');
const { wherePurchaseCountsForProductionMetrics } = require('./archivedBetaPurchases.cjs');

function isBlank(v) {
  if (v == null) return true;
  return String(v).trim() === '';
}

function formatName(u) {
  const first = (u.firstName || u.fname || '').trim();
  const last = (u.lname || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return '(no name)';
}

function matchesSearch(u, qRaw) {
  const q = String(qRaw || '').trim().toLowerCase();
  if (!q) return true;
  const email = (u.email || '').toLowerCase();
  if (email.includes(q)) return true;
  const blob = [u.firstName, u.fname, u.lname, formatName(u)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blob.includes(q);
}

function isPlayerDisplay(u) {
  return isBlank(u.firstName) && isBlank(u.fname) && isBlank(u.lname);
}

async function withQuietPointsRollup(run) {
  const orig = console.log;
  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('POINTS_ROLLUP')) return;
    orig.apply(console, args);
  };
  try {
    return await run();
  } finally {
    console.log = orig;
  }
}

async function mapInBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} opts
 * @param {string} [opts.q]
 * @param {boolean} [opts.contestOnly]
 * @param {number} [opts.topN]
 */
async function getContestAdminReport(prisma, opts = {}) {
  const q = typeof opts.q === 'string' ? opts.q.trim() : '';
  const contestOnly = Boolean(opts.contestOnly);
  const topN = Math.min(100, Math.max(5, Number(opts.topN) || 20));

  const [totalUsers, contestParticipantsCount, totalPurchases, usersRaw, ledgerRows, purchaseGroups] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { contestJoinedAt: { not: null } } }),
      prisma.purchase.count({ where: wherePurchaseCountsForProductionMetrics() }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          fname: true,
          lname: true,
          contestJoinedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ledger.findMany({ select: { userId: true, createdAt: true } }),
      prisma.purchase.groupBy({
        by: ['userId'],
        where: wherePurchaseCountsForProductionMetrics(),
        _count: { _all: true },
      }),
    ]);

  const purchaseCountByUser = new Map(
    purchaseGroups.map((row) => [row.userId, row._count._all])
  );

  /** @type {Map<string, { rows: number; days: Set<string> }>} */
  const ledgerByUser = new Map();
  for (const row of ledgerRows) {
    let rec = ledgerByUser.get(row.userId);
    if (!rec) {
      rec = { rows: 0, days: new Set() };
      ledgerByUser.set(row.userId, rec);
    }
    rec.rows += 1;
    rec.days.add(row.createdAt.toISOString().slice(0, 10));
  }

  let usersWithLedger = 0;
  let usersMultiDayUtc = 0;
  for (const rec of ledgerByUser.values()) {
    usersWithLedger += 1;
    if (rec.days.size > 1) usersMultiDayUtc += 1;
  }

  const enriched = await withQuietPointsRollup(() =>
    mapInBatches(usersRaw, 14, async (u) => {
      const ls = ledgerByUser.get(u.id) || { rows: 0, days: new Set() };
      const rollup = await getPointsRollupForUser(prisma, u.id);
      const purchases = purchaseCountByUser.get(u.id) ?? 0;
      return {
        userId: u.id,
        email: u.email,
        name: formatName(u),
        firstName: u.firstName,
        fname: u.fname,
        lname: u.lname,
        contestJoinedAt: u.contestJoinedAt ? u.contestJoinedAt.toISOString() : null,
        userCreatedAt: u.createdAt.toISOString(),
        totalLedgerPoints: rollup.totalPoints,
        activeDaysUtc: ls.days.size,
        ledgerRowCount: ls.rows,
        purchaseCount: purchases,
        isContestParticipant: u.contestJoinedAt != null,
        isPlayerDisplay: Boolean(u.contestJoinedAt) && isPlayerDisplay(u),
      };
    })
  );

  const byEmail = (a, b) => a.email.localeCompare(b.email);

  const topByPoints = [...enriched]
    .sort((a, b) => {
      if (b.totalLedgerPoints !== a.totalLedgerPoints) return b.totalLedgerPoints - a.totalLedgerPoints;
      if (b.ledgerRowCount !== a.ledgerRowCount) return b.ledgerRowCount - a.ledgerRowCount;
      return byEmail(a, b);
    })
    .slice(0, topN)
    .map(stripInternal);

  const topByActiveDays = [...enriched]
    .sort((a, b) => {
      if (b.activeDaysUtc !== a.activeDaysUtc) return b.activeDaysUtc - a.activeDaysUtc;
      if (b.ledgerRowCount !== a.ledgerRowCount) return b.ledgerRowCount - a.ledgerRowCount;
      return byEmail(a, b);
    })
    .slice(0, topN)
    .map(stripInternal);

  const topByLedgerRows = [...enriched]
    .sort((a, b) => {
      if (b.ledgerRowCount !== a.ledgerRowCount) return b.ledgerRowCount - a.ledgerRowCount;
      if (b.activeDaysUtc !== a.activeDaysUtc) return b.activeDaysUtc - a.activeDaysUtc;
      return byEmail(a, b);
    })
    .slice(0, topN)
    .map(stripInternal);

  const topFinalists = topByPoints.slice(0, 5);

  const players = enriched.filter((r) => r.isPlayerDisplay).map(stripInternal);

  const filtered = enriched.filter((r) => {
    if (contestOnly && !r.isContestParticipant) return false;
    if (!matchesSearch(r, q)) return false;
    return true;
  });

  const users = filtered.map(stripInternal);

  return {
    summary: {
      totalUsers,
      contestParticipants: contestParticipantsCount,
      totalPurchases,
      usersWithAnyLedgerActivity: usersWithLedger,
      usersWithMoreThanOneLedgerDayUtc: usersMultiDayUtc,
      playerDisplayCount: players.length,
    },
    notes: {
      activeDayBasis: 'UTC calendar date (YYYY-MM-DD) on Ledger.createdAt',
      searchMatches: users.length,
      contestOnlyFilter: contestOnly,
      purchasesAndPointsRollup:
        'Purchase totals and per-user purchase counts exclude archived beta (saleStatus archived_beta / countsForPoints false). Ledger rollups exclude rows whose sessionId matches an archived-beta purchase.',
    },
    topFinalists,
    topByTotalLedgerPoints: topByPoints,
    topByActiveDaysUtc: topByActiveDays,
    topByLedgerRowCount: topByLedgerRows,
    playerUsers: players,
    users,
  };
}

function stripInternal(row) {
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    contestJoinedAt: row.contestJoinedAt,
    userCreatedAt: row.userCreatedAt,
    totalLedgerPoints: row.totalLedgerPoints,
    activeDaysUtc: row.activeDaysUtc,
    ledgerRowCount: row.ledgerRowCount,
    purchaseCount: row.purchaseCount,
    isContestParticipant: row.isContestParticipant,
    isPlayerDisplay: row.isPlayerDisplay,
  };
}

module.exports = {
  getContestAdminReport,
  formatName,
  isPlayerDisplay,
  isBlank,
};
