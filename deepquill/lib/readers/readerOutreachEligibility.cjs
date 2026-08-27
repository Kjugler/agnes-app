/**
 * Shared fail-safe eligibility for discretionary / promotional reader outreach.
 * Archived operational profiles are ineligible even when older campaign fields
 * would otherwise qualify them. Independent manual DNC is a separate lane from
 * archive-created suppression.
 *
 * Prospect nurture has schema columns but no runner; future nurture jobs
 * must call promotionalOutreachEligibility before sending.
 *
 * Do not use this helper for purchase receipts, fulfillment, refunds,
 * shipping, claim-profile, or other directly requested transactional mail.
 */
const { isMailableEmail } = require('../../src/lib/normalize.cjs');
const {
  RESTORE_PRIOR_STATUS_REASON,
  resolveContactSuppression,
} = require('./readerContactSuppression.cjs');

const ARCHIVE_STATUS = 'archived';
const LOOKUP_OK = 'ok';
const LOOKUP_FAILED = 'failed';
const IDENTITY_FOUND = 'found';
const IDENTITY_NONE = 'none';
const IDENTITY_UNKNOWN = 'unknown';

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return asTrimmed(value).toLowerCase();
}

function userSelect() {
  return {
    id: true,
    email: true,
    readerProfile: {
      select: { id: true, status: true },
    },
  };
}

function failedEligibility() {
  return {
    eligible: false,
    reason: 'lookup_failed',
    lookup: LOOKUP_FAILED,
    identity: IDENTITY_UNKNOWN,
    profileId: null,
    status: null,
  };
}

function addUserId(set, value) {
  const id = asTrimmed(value);
  if (id) set.add(id);
}

async function queryRows(prisma, sql, value) {
  if (!prisma || typeof prisma.$queryRawUnsafe !== 'function') {
    throw new Error('lookup_unavailable');
  }
  const rows = await prisma.$queryRawUnsafe(sql, value);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Canonical identity for a normalized email. Uses the same locations the
 * application already stores as a person's email: User.email (case-insensitive),
 * Customer.email linked by userId, and ReferralConversion.buyerEmail when a
 * Purchase/Order session ties that conversion to a User.
 * Queries are already constrained by that one email; they must not use a small
 * LIMIT that could hide another matching User. Zero matches → none. One User →
 * found. Two or more Users → ambiguous (fail closed).
 */
async function resolveCanonicalUserIds(prisma, normalized) {
  const ids = new Set();
  const userRows = await queryRows(
    prisma,
    'SELECT id AS userId FROM "User" WHERE lower(email) = lower(?)',
    normalized,
  );
  for (const row of userRows) addUserId(ids, row && row.userId);

  const customerRows = await queryRows(
    prisma,
    'SELECT userId FROM "Customer" WHERE userId IS NOT NULL AND lower(email) = lower(?)',
    normalized,
  );
  for (const row of customerRows) addUserId(ids, row && row.userId);

  const conversionRows = await queryRows(
    prisma,
    'SELECT stripeSessionId FROM "ReferralConversion" WHERE buyerEmail IS NOT NULL AND lower(buyerEmail) = lower(?)',
    normalized,
  );
  const sessionIds = conversionRows
    .map((row) => asTrimmed(row && row.stripeSessionId))
    .filter(Boolean);
  if (sessionIds.length) {
    const [purchases, orders] = await Promise.all([
      prisma.purchase.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { userId: true },
      }),
      prisma.order.findMany({
        where: { stripeSessionId: { in: sessionIds } },
        select: {
          contestPlayerId: true,
          customer: { select: { userId: true } },
        },
      }),
    ]);
    for (const row of purchases) addUserId(ids, row && row.userId);
    for (const row of orders) {
      addUserId(ids, row && row.contestPlayerId);
      addUserId(ids, row && row.customer && row.customer.userId);
    }
  }

  return ids;
}

async function findUser(prisma, { userId, email }) {
  const id = asTrimmed(userId);
  if (id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect(),
    });
    return { kind: user ? 'found' : 'none', user: user || null };
  }
  const normalized = normalizeEmail(email);
  if (!normalized) return { kind: 'none', user: null };

  const ids = await resolveCanonicalUserIds(prisma, normalized);
  if (ids.size > 1) return { kind: 'ambiguous', user: null };
  if (ids.size === 0) return { kind: 'none', user: null };
  const matchedId = [...ids][0];
  const user = await prisma.user.findUnique({
    where: { id: matchedId },
    select: userSelect(),
  });
  return { kind: user ? 'found' : 'none', user: user || null };
}

async function loadDecisions(prisma, userId) {
  return prisma.readerContactDecision.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, decision: true, origin: true, createdAt: true },
  });
}

async function hasOpenRestoreReview(prisma, userId) {
  const row = await prisma.readerIdentityReview.findFirst({
    where: {
      primaryUserId: userId,
      reasonCode: RESTORE_PRIOR_STATUS_REASON,
      status: 'open',
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * @returns {Promise<{
 *   eligible: boolean,
 *   reason: string|null,
 *   lookup: 'ok'|'failed',
 *   identity: 'found'|'none'|'unknown',
 *   profileId: string|null,
 *   status: string|null,
 * }>}
 */
async function promotionalOutreachEligibility(prisma, { userId, email } = {}) {
  if (!prisma) return failedEligibility();

  const id = asTrimmed(userId);
  const normalized = normalizeEmail(email);
  if (!id && (!normalized || !isMailableEmail(normalized))) {
    return {
      eligible: false,
      reason: 'invalid_email',
      lookup: LOOKUP_OK,
      identity: IDENTITY_NONE,
      profileId: null,
      status: null,
    };
  }

  try {
    const found = await findUser(prisma, { userId: id, email: normalized });
    if (found.kind === 'ambiguous') return failedEligibility();
    const user = found.user;
    if (!user) {
      return {
        eligible: true,
        reason: 'no_existing_identity',
        lookup: LOOKUP_OK,
        identity: IDENTITY_NONE,
        profileId: null,
        status: null,
      };
    }

    const profile = user.readerProfile || null;
    const status = profile && profile.status ? String(profile.status) : null;
    const [decisions, openRestoreReview] = await Promise.all([
      loadDecisions(prisma, user.id),
      hasOpenRestoreReview(prisma, user.id),
    ]);
    const suppression = resolveContactSuppression({
      profileStatus: status,
      decisions,
      openRestoreReview,
    });
    if (suppression.suppressed) {
      return {
        eligible: false,
        reason: suppression.reason,
        lookup: LOOKUP_OK,
        identity: IDENTITY_FOUND,
        profileId: profile ? profile.id : null,
        status,
      };
    }

    return {
      eligible: true,
      reason: 'eligible',
      lookup: LOOKUP_OK,
      identity: IDENTITY_FOUND,
      profileId: profile ? profile.id : null,
      status: status || 'active',
    };
  } catch {
    return failedEligibility();
  }
}

async function isPromotionalOutreachEligible(prisma, lookup) {
  const result = await promotionalOutreachEligibility(prisma, lookup);
  return result.eligible === true && result.lookup === LOOKUP_OK;
}

/**
 * Subscribe / enrollment marketing gate.
 * Mailchimp add is allowed only for confirmed eligible readers or a confirmed
 * absence of any matching canonical identity (User.email case-insensitive,
 * Customer.email linked to a User, or conversion/purchase/order session email).
 * Ambiguous or failed lookup is fail-closed. Incomplete identity scans are not used.
 */
async function resolveSubscribePromotionalGate(prisma, email) {
  const result = await promotionalOutreachEligibility(prisma, { email });
  if (result.lookup === LOOKUP_FAILED) {
    return {
      ...result,
      mailchimpAllowed: false,
      localAccess: true,
    };
  }
  if (result.reason === 'invalid_email') {
    return {
      ...result,
      mailchimpAllowed: false,
      localAccess: false,
    };
  }
  const mailchimpAllowed =
    result.lookup === LOOKUP_OK &&
    (result.reason === 'eligible' || result.reason === 'no_existing_identity');
  return {
    ...result,
    mailchimpAllowed,
    localAccess: true,
  };
}

function subscribeLocalAccessResponse(gate) {
  if (gate.reason === 'lookup_failed') {
    return {
      ok: true,
      status: 'soft-fail',
      message: 'Access granted. We’ll finish sign-up shortly.',
    };
  }
  return {
    ok: true,
    status: 'existing',
    message: 'Access Granted! Welcome back!',
  };
}

/**
 * Batch helper for promotional senders that already iterate emails.
 * Fail-safe: archived, independent DNC, unrepaired archive-lane suppress,
 * and conservative restore-review emails are ineligible.
 */
async function loadPromotionalIneligibleEmailSet(prisma) {
  const set = new Set();
  if (!prisma) {
    throw new Error('prisma_required');
  }

  function requireFindMany(name) {
    const delegate = prisma[name];
    if (!delegate || typeof delegate.findMany !== 'function') {
      throw new Error('prisma_required');
    }
    return delegate;
  }

  const readerProfile = requireFindMany('readerProfile');
  const readerContactDecision = requireFindMany('readerContactDecision');
  const readerIdentityReview = requireFindMany('readerIdentityReview');
  const customer = requireFindMany('customer');
  const purchase = requireFindMany('purchase');
  const order = requireFindMany('order');
  const referralConversion = requireFindMany('referralConversion');

  const [profiles, decisions, restoreReviews, customers, purchases, orders, conversions] = await Promise.all([
    readerProfile.findMany({
      select: {
        status: true,
        userId: true,
        user: { select: { id: true, email: true } },
      },
    }),
    readerContactDecision.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        userId: true,
        decision: true,
        origin: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
    readerIdentityReview.findMany({
      where: { reasonCode: RESTORE_PRIOR_STATUS_REASON, status: 'open' },
      select: { primaryUserId: true },
    }),
    customer.findMany({
      select: { email: true, userId: true },
    }),
    purchase.findMany({
      select: { userId: true, sessionId: true },
    }),
    order.findMany({
      select: {
        stripeSessionId: true,
        contestPlayerId: true,
        customer: { select: { userId: true } },
      },
    }),
    referralConversion.findMany({
      select: { buyerEmail: true, stripeSessionId: true },
    }),
  ]);

  const decisionsByUser = new Map();
  for (const row of decisions) {
    if (!decisionsByUser.has(row.userId)) decisionsByUser.set(row.userId, []);
    decisionsByUser.get(row.userId).push(row);
  }
  const restoreReviewUsers = new Set(restoreReviews.map((row) => row.primaryUserId));
  const seenUsers = new Set();
  const extraEmailsByUser = new Map();

  function addExtra(userId, email) {
    const id = asTrimmed(userId);
    const normalized = normalizeEmail(email);
    if (!id || !normalized) return;
    if (!extraEmailsByUser.has(id)) extraEmailsByUser.set(id, new Set());
    extraEmailsByUser.get(id).add(normalized);
  }

  for (const row of customers) addExtra(row.userId, row.email);
  const sessionToUsers = new Map();
  function addSessionUser(sessionId, userId) {
    const sid = asTrimmed(sessionId);
    const id = asTrimmed(userId);
    if (!sid || !id) return;
    if (!sessionToUsers.has(sid)) sessionToUsers.set(sid, new Set());
    sessionToUsers.get(sid).add(id);
  }
  for (const row of purchases) addSessionUser(row.sessionId, row.userId);
  for (const row of orders) {
    addSessionUser(row.stripeSessionId, row.contestPlayerId);
    addSessionUser(row.stripeSessionId, row.customer && row.customer.userId);
  }
  for (const row of conversions) {
    const linked = sessionToUsers.get(asTrimmed(row.stripeSessionId));
    if (!linked) continue;
    for (const userId of linked) addExtra(userId, row.buyerEmail);
  }

  function addEmail(email) {
    const normalized = normalizeEmail(email);
    if (normalized) set.add(normalized);
  }

  function addEmailsForUser(userId, primaryEmail) {
    addEmail(primaryEmail);
    const extras = extraEmailsByUser.get(userId);
    if (extras) {
      for (const email of extras) set.add(email);
    }
  }

  for (const profile of profiles) {
    const userId = profile.userId || (profile.user && profile.user.id);
    if (!userId) continue;
    seenUsers.add(userId);
    const suppression = resolveContactSuppression({
      profileStatus: profile.status,
      decisions: decisionsByUser.get(userId) || [],
      openRestoreReview: restoreReviewUsers.has(userId),
    });
    if (suppression.suppressed) addEmailsForUser(userId, profile.user && profile.user.email);
  }

  for (const [userId, rows] of decisionsByUser.entries()) {
    if (seenUsers.has(userId)) continue;
    const suppression = resolveContactSuppression({
      profileStatus: 'active',
      decisions: rows,
      openRestoreReview: restoreReviewUsers.has(userId),
    });
    if (suppression.suppressed) addEmailsForUser(userId, rows[0] && rows[0].user && rows[0].user.email);
  }

  return set;
}

module.exports = {
  ARCHIVE_STATUS,
  promotionalOutreachEligibility,
  isPromotionalOutreachEligible,
  resolveSubscribePromotionalGate,
  subscribeLocalAccessResponse,
  loadPromotionalIneligibleEmailSet,
};
