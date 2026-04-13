/**
 * List contest-joined users who would show with no personal name on all three fields:
 * firstName, fname, lname — each null or empty after trim.
 *
 * Total points: canonical ledger rollup (same as /api/points/me).
 *
 * Usage (from deepquill root):
 *   node scripts/list-contest-users-displayed-as-player.cjs
 *   node scripts/list-contest-users-displayed-as-player.cjs --json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: false });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });

const { prisma } = require('../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../server/prisma.cjs');
const { getPointsRollupForUser } = require('../lib/pointsRollup.cjs');

function isBlank(v) {
  if (v == null) return true;
  return String(v).trim() === '';
}

const jsonOut = process.argv.includes('--json');

(async () => {
  ensureDatabaseUrl();

  const candidates = await prisma.user.findMany({
    where: { contestJoinedAt: { not: null } },
    select: {
      id: true,
      email: true,
      createdAt: true,
      firstName: true,
      fname: true,
      lname: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const players = candidates.filter(
    (u) => isBlank(u.firstName) && isBlank(u.fname) && isBlank(u.lname)
  );

  const rows = [];
  for (const u of players) {
    const rollup = await getPointsRollupForUser(prisma, u.id);
    rows.push({
      userId: u.id,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      totalLedgerPoints: rollup.totalPoints,
    });
  }

  const payload = {
    count: rows.length,
    users: rows,
  };

  if (jsonOut) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Unique users displayed as "Player" (contest joined, all name fields blank): ${payload.count}\n`);
    for (const r of rows) {
      console.log(
        `${r.userId}\t${r.email}\t${r.createdAt}\t${r.totalLedgerPoints}`
      );
    }
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
