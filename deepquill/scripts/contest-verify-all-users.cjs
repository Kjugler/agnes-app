require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: false });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });
const { prisma } = require('../server/prisma.cjs');
const { getPointsRollupForUser } = require('../lib/pointsRollup.cjs');
const { hasContestJoin } = require('../lib/contest/hasContestJoin.cjs');

(async () => {
  const users = await prisma.user.findMany({ select: { id: true, email: true, points: true } });
  let maxR = 0;
  let joinedAny = 0;
  const badPoints = [];
  for (const u of users) {
    const r = await getPointsRollupForUser(prisma, u.id);
    if (r.totalPoints > maxR) maxR = r.totalPoints;
    if (await hasContestJoin(prisma, u.id)) joinedAny++;
    if (u.points !== 0) badPoints.push(u.email);
  }
  const cj = await prisma.ledger.count({ where: { type: 'CONTEST_JOIN' } });
  console.log(JSON.stringify({ users: users.length, maxRollupTotal: maxR, usersWithContestJoinLedger: joinedAny, ledgerCONTEST_JOIN_rows: cj, userPointsNonZero: badPoints }, null, 2));
  await prisma.$disconnect();
})();
