/**
 * Aggregate user / contest / ledger activity counts.
 *
 * 1. Total users
 * 2. Users with contestJoinedAt (contest participants)
 * 3. Users with any ledger row
 * 4. Users with ledger activity on more than one UTC calendar day (distinct dates)
 *
 * Usage (from deepquill root):
 *   node scripts/contest-user-activity-summary.cjs
 *   node scripts/contest-user-activity-summary.cjs --json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: false });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });

const { prisma } = require('../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../server/prisma.cjs');

const jsonOut = process.argv.includes('--json');

(async () => {
  ensureDatabaseUrl();

  const [totalUsers, contestParticipants] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { contestJoinedAt: { not: null } } }),
  ]);

  const ledgerRows = await prisma.ledger.findMany({
    select: { userId: true, createdAt: true },
  });

  /** @type {Map<string, Set<string>>} userId -> set of YYYY-MM-DD (UTC) */
  const daysByUser = new Map();
  for (const row of ledgerRows) {
    const day = row.createdAt.toISOString().slice(0, 10);
    let set = daysByUser.get(row.userId);
    if (!set) {
      set = new Set();
      daysByUser.set(row.userId, set);
    }
    set.add(day);
  }

  const usersWithAnyLedgerActivity = daysByUser.size;
  let usersWithMoreThanOneDayOfActivity = 0;
  for (const days of daysByUser.values()) {
    if (days.size > 1) usersWithMoreThanOneDayOfActivity += 1;
  }

  const out = {
    totalUsers,
    contestParticipants,
    usersWithAnyLedgerActivity,
    usersWithMoreThanOneDayOfActivity,
    /** Clarifies how "day" is defined for #4 */
    activityDayBasis: 'UTC calendar date (YYYY-MM-DD) from Ledger.createdAt',
  };

  if (jsonOut) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('User & ledger activity summary\n');
    console.log(`1. Total users:                          ${out.totalUsers}`);
    console.log(`2. Contest participants (joined):      ${out.contestParticipants}`);
    console.log(`3. Users with any ledger activity:       ${out.usersWithAnyLedgerActivity}`);
    console.log(`4. Users with >1 day of ledger activity: ${out.usersWithMoreThanOneDayOfActivity}`);
    console.log(`\n(${out.activityDayBasis})`);
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
