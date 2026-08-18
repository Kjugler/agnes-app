/**
 * Verify purchase suppresses RA-v2 prospect nurture (no Stripe).
 * Usage: node scripts/verify-prospect-nurture-purchase-suppress.cjs
 */
const { prisma } = require('../server/prisma.cjs');
const { READERS_AGREE_V2_SOURCE } = require('../lib/readers/readersAgreeLead.cjs');
const { userHasPurchase } = require('../lib/readers/readerStatus.cjs');

async function main() {
  const email = `phase-d-suppress+${Date.now()}@example.com`;
  const { ensureAssociateMinimal } = require('../api/contest/login.cjs');
  const { upsertReadersAgreeReaderProfile, buildLeadAttributionSnapshot } = require('../lib/readers/readersAgreeLead.cjs');

  const user = await ensureAssociateMinimal(email);
  const attribution = buildLeadAttributionSnapshot({
    visitorId: 'suppress-test',
    captureSurface: 'landing',
  });
  const profile = await upsertReadersAgreeReaderProfile(prisma, user.id, {
    attribution,
    consentAccepted: true,
  });

  await prisma.purchase.create({
    data: {
      userId: user.id,
      sessionId: `e2e-suppress-${Date.now()}`,
      amount: 1999,
      currency: 'usd',
      source: 'e2e-test',
    },
  });

  const purchased = await userHasPurchase(prisma, user.id);
  if (purchased) {
    await prisma.readerProfile.update({
      where: { id: profile.id },
      data: {
        prospectNurtureSuppressedAt: new Date(),
        prospectNurtureSuppressedReason: 'purchased',
      },
    });
  }

  const updated = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
  console.log(
    JSON.stringify(
      {
        pass:
          updated?.source === READERS_AGREE_V2_SOURCE &&
          purchased === true &&
          updated?.prospectNurtureSuppressedAt != null &&
          updated?.prospectNurtureSuppressedReason === 'purchased',
        email,
        userId: user.id,
        purchased,
        suppressedAt: updated?.prospectNurtureSuppressedAt,
        reason: updated?.prospectNurtureSuppressedReason,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
