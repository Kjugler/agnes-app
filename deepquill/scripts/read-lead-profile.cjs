/** Read lead attribution for an email from local dev.db. */
const { prisma } = require('../server/prisma.cjs');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('usage: node scripts/read-lead-profile.cjs <email>');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { readerProfile: true },
  });
  console.log(JSON.stringify(user?.readerProfile ?? null, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
