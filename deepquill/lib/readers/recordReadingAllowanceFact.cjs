/**
 * Append one server allowance fact. A repeated outcome for the same visitor
 * is not inserted again. Snapshots are kept once per credited total.
 * Does not enroll nurture, set consent, or send mail.
 */

const { factType, allowanceFactMeta } = require('./readingAllowanceEngagement.cjs');

function findForOwner(prisma, type, meta, outcome, ownerId) {
  const ownerIsNull = ownerId == null;
  if (outcome === 'snapshot') {
    if (ownerIsNull) {
      return prisma.$queryRaw`
        SELECT "id" FROM "Event"
        WHERE "userId" IS NULL
          AND "type" = ${type}
          AND json_extract("meta", '$.visitorId') = ${meta.visitorId}
          AND json_extract("meta", '$.outcome') = ${outcome}
          AND json_extract("meta", '$.qualifyingMs') = ${meta.qualifyingMs}
        LIMIT 1
      `;
    }
    return prisma.$queryRaw`
      SELECT "id" FROM "Event"
      WHERE "userId" = ${ownerId}
        AND "type" = ${type}
        AND json_extract("meta", '$.visitorId') = ${meta.visitorId}
        AND json_extract("meta", '$.outcome') = ${outcome}
        AND json_extract("meta", '$.qualifyingMs') = ${meta.qualifyingMs}
      LIMIT 1
    `;
  }
  if (ownerIsNull) {
    return prisma.$queryRaw`
      SELECT "id" FROM "Event"
      WHERE "userId" IS NULL
        AND "type" = ${type}
        AND json_extract("meta", '$.visitorId') = ${meta.visitorId}
        AND json_extract("meta", '$.outcome') = ${outcome}
      LIMIT 1
    `;
  }
  return prisma.$queryRaw`
    SELECT "id" FROM "Event"
    WHERE "userId" = ${ownerId}
      AND "type" = ${type}
      AND json_extract("meta", '$.visitorId') = ${meta.visitorId}
      AND json_extract("meta", '$.outcome') = ${outcome}
    LIMIT 1
  `;
}

/**
 * Event is indexed by (userId, type, createdAt). Matching that prefix keeps
 * a snapshot lookup off a full table scan. Anonymous rows and rows already
 * attached to this user are checked separately so an email backfill still
 * sees the gate event written before identification.
 */
async function findExisting(prisma, type, meta, outcome, userId) {
  const anonymous = await findForOwner(prisma, type, meta, outcome, null);
  if (Array.isArray(anonymous) && anonymous.length > 0) return anonymous;
  if (!userId) return [];
  return findForOwner(prisma, type, meta, outcome, userId);
}

async function recordReadingAllowanceFact(prisma, fact, userId) {
  const type = factType(fact && fact.outcome);
  if (!prisma || !type || !fact || !fact.visitorId) return { ok: false, reason: 'skipped' };
  const meta = allowanceFactMeta(fact);
  const existing = await findExisting(prisma, type, meta, fact.outcome, userId || null);
  if (Array.isArray(existing) && existing.length > 0) return { ok: true, duplicate: true };

  await prisma.event.create({
    data: {
      type,
      userId: userId || null,
      meta,
    },
  });
  return { ok: true, duplicate: false };
}

module.exports = { recordReadingAllowanceFact };
