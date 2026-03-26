require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: false });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });
const { prisma } = require('../server/prisma.cjs');
(async () => {
  const r = await prisma.ledger.groupBy({ by: ['type'], _count: true });
  console.log(JSON.stringify(r, null, 2));
  await prisma.$disconnect();
})();
