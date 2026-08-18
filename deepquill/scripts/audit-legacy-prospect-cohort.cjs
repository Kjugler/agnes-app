/**
 * Read-only audit: existing DB users vs RA-v2 nurture eligibility.
 * Does NOT enroll or send email.
 *
 * Usage: node scripts/audit-legacy-prospect-cohort.cjs
 */
const { prisma } = require('../server/prisma.cjs');
const { READERS_AGREE_V2_SOURCE } = require('../lib/readers/readersAgreeLead.cjs');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.endsWith('@example.com')) return false;
  return EMAIL_RE.test(normalized);
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      noPurchaseEmailSentAt: true,
      readerRecommendationOutreachSentAt: true,
      readerRecommendationOutreachBatch: true,
      purchases: { select: { id: true }, take: 1 },
      readerProfile: {
        select: {
          source: true,
          readerType: true,
          emailUpdatesConsent: true,
          emailMarketingConsentAt: true,
          jodyVerifiedAt: true,
          prospectNurtureEnrolledAt: true,
          prospectNurtureSuppressedAt: true,
          prospectNurtureSuppressedReason: true,
          lastDeliveredChapterId: true,
          lastCompletedChapterId: true,
        },
      },
    },
  });

  const summary = {
    totalUsers: users.length,
    nonPurchasers: 0,
    nonPurchasersValidEmail: 0,
    explicitMarketingConsent: 0,
    jodyKnownReader: 0,
    alreadyReceivedNoPurchaseReminder: 0,
    alreadyReceivedReaderRecommendationOutreach: 0,
    alreadyInProspectNurture: 0,
    raV2Source: 0,
    suppressedProspectNurture: 0,
    legacyProspectReengagementCandidates: 0,
  };

  const buckets = {
    legacyReengagementCandidates: [],
    inOtherNurture: [],
    suppressedOrSent: [],
  };

  for (const user of users) {
    const purchased = user.purchases.length > 0;
    if (purchased) continue;

    summary.nonPurchasers += 1;
    if (!isValidEmail(user.email)) continue;
    summary.nonPurchasersValidEmail += 1;

    const profile = user.readerProfile;
    const marketingConsent =
      profile?.emailUpdatesConsent === true || profile?.emailMarketingConsentAt != null;
    if (marketingConsent) summary.explicitMarketingConsent += 1;

    const jodyKnown =
      profile?.jodyVerifiedAt != null ||
      profile?.lastDeliveredChapterId != null ||
      profile?.lastCompletedChapterId != null;
    if (jodyKnown) summary.jodyKnownReader += 1;

    if (user.noPurchaseEmailSentAt) summary.alreadyReceivedNoPurchaseReminder += 1;
    if (user.readerRecommendationOutreachSentAt) {
      summary.alreadyReceivedReaderRecommendationOutreach += 1;
    }

    if (profile?.prospectNurtureEnrolledAt) summary.alreadyInProspectNurture += 1;
    if (profile?.source === READERS_AGREE_V2_SOURCE) summary.raV2Source += 1;
    if (profile?.prospectNurtureSuppressedAt) summary.suppressedProspectNurture += 1;

    const inOtherFlow =
      user.noPurchaseEmailSentAt ||
      user.readerRecommendationOutreachSentAt ||
      profile?.prospectNurtureEnrolledAt ||
      profile?.source === READERS_AGREE_V2_SOURCE;

    const candidate =
      !inOtherFlow &&
      !jodyKnown &&
      marketingConsent &&
      !profile?.prospectNurtureSuppressedAt;

    if (inOtherFlow) {
      buckets.inOtherNurture.push({
        email: user.email,
        noPurchase: Boolean(user.noPurchaseEmailSentAt),
        rrOutreach: Boolean(user.readerRecommendationOutreachSentAt),
        nurtureEnrolled: Boolean(profile?.prospectNurtureEnrolledAt),
        source: profile?.source ?? null,
      });
    } else if (profile?.prospectNurtureSuppressedAt) {
      buckets.suppressedOrSent.push({
        email: user.email,
        reason: profile.prospectNurtureSuppressedReason,
      });
    } else if (candidate) {
      summary.legacyProspectReengagementCandidates += 1;
      buckets.legacyReengagementCandidates.push({
        email: user.email,
        createdAt: user.createdAt,
        readerType: profile?.readerType ?? null,
        source: profile?.source ?? null,
      });
    }
  }

  console.log(JSON.stringify({ summary, sampleBuckets: {
    legacyReengagementCandidates: buckets.legacyReengagementCandidates.slice(0, 10),
    inOtherNurture: buckets.inOtherNurture.slice(0, 10),
    suppressedOrSent: buckets.suppressedOrSent.slice(0, 10),
  } }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
