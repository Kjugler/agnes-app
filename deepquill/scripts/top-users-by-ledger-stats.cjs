/**
 * Top N users by ledger-derived metrics (canonical points via rollup).
 *
 * Rankings:
 * - Total ledger points (getPointsRollupForUser — same as /api/points/me)
 * - Active days (distinct UTC calendar days on Ledger.createdAt)
 * - Actions (count of ledger rows)
 *
 * Usage (from deepquill root):
 *   node scripts/top-users-by-ledger-stats.cjs
 *   node scripts/top-users-by-ledger-stats.cjs --json
 *   node scripts/top-users-by-ledger-stats.cjs --top=50
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: false });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });

const { prisma } = require('../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../server/prisma.cjs');
const { getPointsRollupForUser } = require('../lib/pointsRollup.cjs');

const jsonOut = process.argv.includes('--json');
const topArg = process.argv.find((a) => a.startsWith('--top='));
const TOP = topArg ? Math.max(1, parseInt(topArg.split('=')[1], 10) || 20, 10) : 20;

function formatName(u) {
  const first = (u.firstName || u.fname || '').trim();
  const last = (u.lname || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return '(no name)';
}

function sortTakeByComparator(arr, cmp) {
  return [...arr].sort(cmp).slice(0, TOP);
}

async function mapInBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const part = await Promise.all(batch.map(fn));
    out.push(...part);
  }
  return out;
}

/** Suppress verbose [POINTS_ROLLUP] logs from lib/pointsRollup.cjs during batch rollup. */
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

(async () => {
  ensureDatabaseUrl();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      fname: true,
      lname: true,
    },
  });

  const ledgerRows = await prisma.ledger.findMany({
    select: { userId: true, createdAt: true },
  });

  /** @type {Map<string, { rows: number, days: Set<string> }>} */
  const byUser = new Map();
  for (const row of ledgerRows) {
    let rec = byUser.get(row.userId);
    if (!rec) {
      rec = { rows: 0, days: new Set() };
      byUser.set(row.userId, rec);
    }
    rec.rows += 1;
    rec.days.add(row.createdAt.toISOString().slice(0, 10));
  }

  const enriched = await withQuietPointsRollup(() =>
    mapInBatches(users, 12, async (u) => {
      const ls = byUser.get(u.id) || { rows: 0, days: new Set() };
      const rollup = await getPointsRollupForUser(prisma, u.id);
      return {
        userId: u.id,
        email: u.email,
        name: formatName(u),
        totalLedgerPoints: rollup.totalPoints,
        activeDays: ls.days.size,
        ledgerRowCount: ls.rows,
      };
    })
  );

  const byEmail = (a, b) => a.email.localeCompare(b.email);

  const byPoints = sortTakeByComparator(enriched, (a, b) => {
    if (b.totalLedgerPoints !== a.totalLedgerPoints) return b.totalLedgerPoints - a.totalLedgerPoints;
    if (b.ledgerRowCount !== a.ledgerRowCount) return b.ledgerRowCount - a.ledgerRowCount;
    if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
    return byEmail(a, b);
  });

  const byActiveDays = sortTakeByComparator(enriched, (a, b) => {
    if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
    if (b.ledgerRowCount !== a.ledgerRowCount) return b.ledgerRowCount - a.ledgerRowCount;
    if (b.totalLedgerPoints !== a.totalLedgerPoints) return b.totalLedgerPoints - a.totalLedgerPoints;
    return byEmail(a, b);
  });

  const byActions = sortTakeByComparator(enriched, (a, b) => {
    if (b.ledgerRowCount !== a.ledgerRowCount) return b.ledgerRowCount - a.ledgerRowCount;
    if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
    if (b.totalLedgerPoints !== a.totalLedgerPoints) return b.totalLedgerPoints - a.totalLedgerPoints;
    return byEmail(a, b);
  });

  const payload = {
    top: TOP,
    activeDayBasis: 'UTC calendar date (YYYY-MM-DD) from Ledger.createdAt',
    byTotalLedgerPoints: byPoints,
    byActiveDays: byActiveDays,
    byLedgerRowCount: byActions,
  };

  if (jsonOut) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const printBlock = (title, rows, metricKey) => {
      console.log(`\n${title} (top ${TOP})\n`);
      rows.forEach((r, i) => {
        console.log(
          `${String(i + 1).padStart(2, ' ')}. ${r.name} <${r.email}>  ${metricKey}=${r[metricKey]}`
        );
      });
    };
    console.log('Top users by ledger stats');
    printBlock('By total ledger points', byPoints, 'totalLedgerPoints');
    printBlock('By number of active days', byActiveDays, 'activeDays');
    printBlock('By number of actions (ledger rows)', byActions, 'ledgerRowCount');
    console.log(`\n(${payload.activeDayBasis})`);
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
