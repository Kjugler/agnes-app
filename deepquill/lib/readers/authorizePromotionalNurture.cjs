/**
 * The only authorization gate for a future nurturing sender.
 *
 * Loads the reader from the database and runs the Mailchimp Transactional
 * reject check itself. Caller-supplied suppression data is ignored.
 * This function does not send email. Purchase receipts keep using sendEmail.
 *
 * A nurturing sender must call authorizePromotionalNurture and send only when
 * authorized is true. Older promotional jobs use lookupPromotionalConsent
 * immediately before a live send. Purchase receipts do not.
 */

const { independentDncActive } = require('./readerContactSuppression.cjs');
const { decideReaderNurture, DECISION, TREATMENT } = require('./nurtureDecision.cjs');
const { checkTransactionalSuppression } = require('../email/transactionalSuppression.cjs');
const { buildPromotionalUnsubscribeUrl } = require('./promotionalUnsubscribeToken.cjs');
const {
  loadProspectEngagementEvents,
  visitorIdsByUserFromProfiles,
} = require('./prospectEngagementEvents.cjs');
const { FUNNEL_EVENT_TYPES } = require('../funnel/funnelEventTypes.cjs');

const EXTRA_EVENT_TYPES = [
  FUNNEL_EVENT_TYPES.CHECKOUT_STARTED,
  FUNNEL_EVENT_TYPES.CATALOG_BUY_CLICK,
  FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK,
  FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK,
  FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_DIRECT_CLICK,
];

function denied(reason, extra = {}) {
  return {
    authorized: false,
    send: false,
    decision: extra.decision || null,
    treatment: extra.treatment || null,
    readerRef: extra.readerRef || null,
    unsubscribeUrl: null,
    ...extra,
    reason,
    authorized: false,
    send: false,
  };
}

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

async function readRows(query) {
  if (typeof query !== 'function') return [];
  const rows = await query();
  return asRows(rows);
}

function earliestIso(rows) {
  let earliest = null;
  for (const row of rows) {
    const raw = row && (row.createdAt || row.purchasedAt);
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    const iso = date.toISOString();
    if (!earliest || iso < earliest) earliest = iso;
  }
  return earliest;
}

function publicReason(decision) {
  if (decision.reason === 'provider_reject' && String(decision.providerReason || '').toLowerCase() === 'hard-bounce') {
    return 'hard_bounce';
  }
  return decision.reason || 'not_authorized';
}

async function loadSnapshot(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      code: true,
      referralCode: true,
    },
  });
  if (!user) return { user: null };

  const [profile, purchases, evidence, decisions, communications, review] = await Promise.all([
    prisma.readerProfile.findUnique({ where: { userId } }),
    readRows(() => prisma.purchase.findMany({
      where: { userId },
      select: { userId: true, sessionId: true, saleStatus: true, createdAt: true },
    })),
    readRows(() => prisma.readerEvidence.findMany({
      where: { userId },
      select: {
        kind: true,
        status: true,
        sourceLabel: true,
        purchaseDate: true,
        details: true,
        stripeSessionId: true,
      },
    })),
    readRows(() => prisma.readerContactDecision.findMany({
      where: { userId },
      select: { id: true, decision: true, origin: true, createdAt: true },
    })),
    readRows(() => prisma.readerCommunication.findMany({
      where: { userId },
      select: { category: true, outcome: true, occurredAt: true },
    })),
    prisma.review && typeof prisma.review.findFirst === 'function'
      ? prisma.review.findFirst({ where: { userId }, select: { id: true } }).catch(() => null)
      : null,
  ]);

  const profiles = profile ? [profile] : [];
  const visitors = visitorIdsByUserFromProfiles(profiles);
  const grouped = await loadProspectEngagementEvents(prisma, [userId], visitors);
  const engagementEvents = grouped.get(userId) || [];
  const extraEvents = await readRows(() => prisma.event.findMany({
    where: { userId, type: { in: EXTRA_EVENT_TYPES } },
    select: { id: true, userId: true, type: true, meta: true, createdAt: true },
  }));
  const seen = new Set(engagementEvents.map((row) => row.id).filter(Boolean));
  const events = engagementEvents.concat(extraEvents.filter((row) => !row.id || !seen.has(row.id)));

  const livePurchases = purchases.filter((row) => String(row.saleStatus || 'live').toLowerCase() !== 'archived_beta');
  return {
    user,
    profile,
    purchases: livePurchases.map((row) => ({
      userId: row.userId,
      sessionId: row.sessionId,
      saleStatus: row.saleStatus || 'live',
      purchasedAt: row.createdAt,
    })),
    evidence,
    decisions,
    communications,
    knownReview: Boolean(review),
    events,
    confirmedPurchaseAt: earliestIso(livePurchases),
  };
}

/**
 * @param {object} prisma
 * @param {{ userId: string, treatment: string, now?: string|Date }} request
 * @param {{ checkTransactionalSuppression?: Function }} [deps] Tests only. Production callers omit this.
 */
async function authorizePromotionalNurture(prisma, request = {}, deps = {}) {
  const userId = typeof request.userId === 'string' ? request.userId.trim() : '';
  const treatment = typeof request.treatment === 'string' ? request.treatment.trim() : '';
  if (!prisma || !userId || !treatment) return denied('reader_not_found');

  let snapshot;
  try {
    snapshot = await loadSnapshot(prisma, userId);
  } catch {
    return denied('reader_load_failed', { readerRef: userId });
  }
  if (!snapshot.user) return denied('reader_not_found', { readerRef: userId });

  const check = typeof deps.checkTransactionalSuppression === 'function'
    ? deps.checkTransactionalSuppression
    : checkTransactionalSuppression;
  let providerSuppression;
  try {
    providerSuppression = await check(snapshot.user.email);
  } catch {
    providerSuppression = {
      checked: false,
      suppressed: true,
      reason: 'provider_check_failed',
      providerReason: 'rejects_list_failed',
    };
  }
  if (!providerSuppression || typeof providerSuppression !== 'object' || providerSuppression.checked !== true) {
    return denied('provider_check_failed', { readerRef: snapshot.user.id });
  }

  const profile = snapshot.profile || {};
  const decision = decideReaderNurture({
    readerRef: snapshot.user.id,
    now: request.now,
    email: snapshot.user.email,
    profile,
    purchases: snapshot.purchases,
    evidence: snapshot.evidence,
    doNotContact: independentDncActive(snapshot.decisions),
    leadAttribution: profile.leadAttribution || null,
    events: snapshot.events,
    communications: snapshot.communications,
    knownReview: snapshot.knownReview,
    emailMarketingConsentAt: profile.emailMarketingConsentAt || null,
    emailMarketingConsentSource: profile.emailMarketingConsentSource || null,
    emailMarketingOptOutAt: profile.emailMarketingOptOutAt || null,
    emailMarketingOptOutSource: profile.emailMarketingOptOutSource || null,
    confirmedPurchaseAt: snapshot.confirmedPurchaseAt,
    ownReferralCode: (snapshot.user.referralCode || snapshot.user.code || '').trim(),
    providerSuppression,
  });

  const base = {
    decision: decision.finalDecision,
    treatment: decision.recommendedTreatment,
    readerRef: decision.readerRef,
    category: decision.category || null,
    timing: decision.recommendedTiming || null,
    prerequisite: decision.prerequisite || null,
  };

  if (!decision.canSendPromotional || decision.finalDecision === DECISION.SUPPRESSED) {
    return denied(publicReason(decision), base);
  }
  if (decision.recommendedTreatment !== treatment) {
    return denied('treatment_not_eligible', base);
  }
  if (decision.finalDecision === DECISION.NOT_YET) {
    return denied('scheduled_time_not_reached', base);
  }
  if (decision.finalDecision !== DECISION.HOLD) {
    return denied(publicReason(decision), base);
  }

  let unsubscribeUrl = null;
  try {
    unsubscribeUrl = buildPromotionalUnsubscribeUrl({
      userId: snapshot.user.id,
      email: snapshot.user.email,
    });
  } catch {
    return denied('unsubscribe_link_unavailable', base);
  }

  return {
    authorized: true,
    send: false,
    reason: 'authorized',
    decision: decision.finalDecision,
    treatment: decision.recommendedTreatment,
    readerRef: decision.readerRef,
    category: decision.category || null,
    timing: decision.recommendedTiming || null,
    prerequisite: decision.prerequisite || null,
    unsubscribeUrl,
  };
}

/**
 * Authorize only the treatment the decision engine itself recommends.
 * Still does not send. A prerequisite that blocks Text a Friend is not authorized.
 */
async function authorizeRecommendedPromotionalNurture(prisma, request = {}, deps = {}) {
  const preview = await authorizePromotionalNurture(
    prisma,
    { ...request, treatment: '__pending__' },
    deps,
  );
  if (preview.reason !== 'treatment_not_eligible' || !preview.treatment || preview.treatment === 'none') {
    return preview;
  }
  if (preview.prerequisite === 'personal_referral_code_required') {
    return { ...preview, authorized: false, send: false, reason: 'prerequisite_unmet' };
  }
  return authorizePromotionalNurture(
    prisma,
    { ...request, treatment: preview.treatment },
    deps,
  );
}

module.exports = {
  authorizePromotionalNurture,
  authorizeRecommendedPromotionalNurture,
  TREATMENT,
};
