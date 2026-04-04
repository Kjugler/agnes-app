/**
 * One-off official Signal Room posts (system signals), idempotent on fixed ids.
 */

const BETA_DECLARATION_ID = 'official_beta_declaration_v1';

const BETA_DECLARATION_TITLE = 'Declaration of the Beta-Test Contest';

const BETA_DECLARATION_CONTENT = `When in the course of digital events, it becomes necessary to distinguish the curious from the committed, the passive from the participant, and the observer from the one willing to engage, a public contest shall be declared.

Let it be known that the Beta-Test Contest of The Agnes Protocol shall proceed under the following order:

First: Each calendar day, according to the time observed in America/Denver, the three participants who earn the greatest number of points during that day shall be ranked.

Second: Daily honors shall be awarded as follows:

First Place — 10 contest points
Second Place — 5 contest points
Third Place — 3 contest points

Third: In the event of a tie, the earlier qualifying timestamp shall prevail.

Fourth: No daily honors shall be awarded to any participant who earns zero points during that day.

Fifth: Participants may place on multiple days. Consistency, not mere arrival, shall determine advantage.

Sixth: Upon the closing of Beta Testing on April 12, 2026, the five participants with the highest total of daily placement points shall enter the final drawing for the Grand Prize.

Seventh: The Grand Prize winner shall be selected at random from among those five finalists.

Eighth: Entry into the Quiet Reveal shall initially extend to all active contestants until the field exceeds twenty participants. Thereafter, qualification shall be reserved for the top 15% by total points, with earliest qualifying timestamp governing any tie.

Ninth: Additional cash challenges may be declared and announced during the contest period, and such declarations shall carry the full force of contest law upon publication.

So ordered for the duration of the Beta-Test period.

Simon McQuade
Vector`;

/**
 * Ensures the parchment-style beta declaration exists as a normal approved system signal.
 */
async function ensureBetaDeclarationSignal(prisma) {
  if (!prisma?.signal) return null;

  const existing = await prisma.signal.findUnique({
    where: { id: BETA_DECLARATION_ID },
    select: { id: true },
  });
  if (existing) return existing;

  const now = new Date();
  const tags = { feedStyle: 'parchment_declaration', betaContestDeclaration: true };

  return prisma.signal.create({
    data: {
      id: BETA_DECLARATION_ID,
      text: 'Declaration of the Beta-Test Contest (official post).',
      title: BETA_DECLARATION_TITLE,
      content: BETA_DECLARATION_CONTENT,
      isSystem: true,
      type: 'NARRATIVE',
      status: 'APPROVED',
      approvedAt: now,
      createdAt: now,
      discussionEnabled: true,
      tags,
      publishStatus: 'PUBLISHED',
      publishAt: now,
    },
  });
}

module.exports = {
  ensureBetaDeclarationSignal,
  BETA_DECLARATION_ID,
};
