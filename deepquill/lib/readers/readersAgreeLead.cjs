/**
 * Readers Agree lead identity helpers (Stages A+B).
 *
 * Creates or updates ReaderProfile for CRM visibility. This is not the
 * Phase D upsert: it never writes prospectNurture* columns, never sends
 * email, and never relabels a stronger existing lifecycle classification
 * (purchaser, gifted/known owner, archived, DNC) to prospect.
 */

const { classifyReader, OWNERSHIP, SOURCE } = require('./classifyReader.cjs');
const { independentDncActive } = require('./readerContactSuppression.cjs');

const READERS_AGREE_V2_SOURCE = 'readers-agree-v2';
const PROSPECT_TYPE = 'prospect';

function deriveChannel(utm = {}) {
  if (utm.fbclid || utm.utm_source === 'facebook' || utm.utm_source === 'meta') {
    return 'meta';
  }
  if (utm.utm_source === 'tiktok') return 'tiktok';
  if (utm.ref || utm.code) return 'referral';
  if (utm.utm_source) return String(utm.utm_source);
  return 'unknown';
}

function resolveCaptureSurface(value) {
  return value === 'bridge' ? 'bridge' : 'landing';
}

function resolveRetailerOrigin(value) {
  return value === 'amazon' || value === 'bn' ? value : null;
}

function buildLeadAttributionSnapshot({
  visitorId,
  ref,
  code,
  utm = {},
  captureSurface,
  retailerOrigin,
}) {
  return {
    visitorId: visitorId || null,
    ref: ref || null,
    code: code || null,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    fbclid: utm.fbclid || null,
    src: utm.src || null,
    origin: utm.origin || null,
    v: utm.v || null,
    channel: deriveChannel({ ...utm, ref, code }),
    captureSurface: resolveCaptureSurface(captureSurface),
    retailerOrigin: resolveRetailerOrigin(retailerOrigin),
    capturedAt: new Date().toISOString(),
  };
}

function mapClassifiedSource(sourceKey) {
  if (sourceKey === SOURCE.WEBSITE) return 'Website';
  if (sourceKey === SOURCE.AMAZON) return 'Amazon';
  if (sourceKey === SOURCE.BARNES_NOBLE) return 'Barnes & Noble';
  if (sourceKey === SOURCE.OTHER) return 'Other';
  return null;
}

function consentFields(consentAccepted, existing) {
  if (consentAccepted !== true) return {};
  const now = new Date();
  const data = { emailUpdatesConsent: true };
  if (!existing?.emailUpdatesConsentAt) data.emailUpdatesConsentAt = now;
  if (!existing?.emailMarketingConsentAt) data.emailMarketingConsentAt = now;
  return data;
}

function createLabelsForNewProfile({ classification, earnedPurchaseBook }) {
  const ownership = classification && classification.ownership;
  if (ownership === OWNERSHIP.PURCHASER || earnedPurchaseBook) {
    return {
      source: mapClassifiedSource(classification && classification.sources && classification.sources[0]) || 'Website',
      readerType: 'purchased',
      status: 'active',
    };
  }
  if (ownership === OWNERSHIP.BOOK_OWNER_GIFTED) {
    return {
      source: 'Gift',
      readerType: 'gifted',
      status: 'active',
    };
  }
  if (ownership === OWNERSHIP.UNKNOWN) {
    return {
      source: null,
      readerType: 'interested',
      status: 'active',
    };
  }
  return {
    source: READERS_AGREE_V2_SOURCE,
    readerType: PROSPECT_TYPE,
    status: 'active',
  };
}

async function loadLeadClassification(prisma, userId) {
  const [user, purchases, evidence, decisions, reviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, earnedPurchaseBook: true },
    }),
    prisma.purchase.findMany({
      where: { userId },
      select: { userId: true, sessionId: true, saleStatus: true, createdAt: true },
    }),
    prisma.readerEvidence.findMany({
      where: { userId },
      select: {
        kind: true,
        status: true,
        sourceLabel: true,
        purchaseDate: true,
        details: true,
        stripeSessionId: true,
      },
    }),
    prisma.readerContactDecision.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, decision: true, origin: true, createdAt: true },
    }),
    prisma.readerIdentityReview.findMany({
      where: {
        status: 'open',
        OR: [{ primaryUserId: userId }, { otherUserId: userId }],
      },
      select: { status: true, primaryUserId: true, otherUserId: true },
    }),
  ]);

  const sessionIds = [...new Set(evidence.map((row) => row.stripeSessionId).filter(Boolean))];
  const extraSessions = sessionIds.filter((id) => !purchases.some((p) => p.sessionId === id));
  const extraPurchases = extraSessions.length
    ? await prisma.purchase.findMany({
        where: { sessionId: { in: extraSessions } },
        select: { sessionId: true, userId: true },
      })
    : [];
  const purchaseBySession = new Map(
    [...purchases, ...extraPurchases].map((row) => [row.sessionId, row]),
  );

  const earnedPurchaseBook = Boolean(user && user.earnedPurchaseBook);
  const classification = classifyReader({
    userId,
    email: user && user.email,
    doNotContact: independentDncActive(decisions),
    identityReviewRequired: reviews.length > 0,
    purchases: purchases.map((row) => ({
      userId: row.userId,
      sessionId: row.sessionId,
      saleStatus: row.saleStatus,
      purchasedAt: row.createdAt,
    })),
    evidence: evidence.map((row) => {
      const linked = row.stripeSessionId ? purchaseBySession.get(row.stripeSessionId) : null;
      return {
        kind: row.kind,
        status: row.status,
        sourceLabel: row.sourceLabel,
        purchaseDate: row.purchaseDate,
        details: row.details,
        stripeSessionId: row.stripeSessionId,
        claimedUserId: userId,
        purchaseUserId: linked ? linked.userId : null,
      };
    }),
  });

  return { classification, earnedPurchaseBook };
}

/**
 * Identity-only ReaderProfile sync. Callers must still grant sample-chapter
 * access if this throws — wrap in try/catch.
 */
async function syncReadersAgreeLeadProfile(prisma, userId, { attribution, consentAccepted } = {}) {
  if (!userId) return { action: 'skipped', reason: 'missing_user' };

  const existing = await prisma.readerProfile.findUnique({ where: { userId } });
  const snapshot = attribution && typeof attribution === 'object' ? attribution : {};

  if (existing) {
    const data = {
      leadAttribution: snapshot,
      ...consentFields(consentAccepted, existing),
    };
    const profile = await prisma.readerProfile.update({
      where: { userId },
      data,
    });
    return {
      action: 'updated',
      profileId: profile.id,
      source: profile.source,
      readerType: profile.readerType,
      status: profile.status,
    };
  }

  let classification = null;
  let earnedPurchaseBook = false;
  try {
    const loaded = await loadLeadClassification(prisma, userId);
    classification = loaded.classification;
    earnedPurchaseBook = loaded.earnedPurchaseBook;
  } catch (err) {
    console.warn('[readers-agree/lead] classification lookup failed; skipping profile create', {
      userId,
      message: err && err.message,
    });
    return { action: 'skipped', reason: 'classification_failed' };
  }

  const labels = createLabelsForNewProfile({ classification, earnedPurchaseBook });
  const profile = await prisma.readerProfile.create({
    data: {
      userId,
      ...labels,
      leadAttribution: snapshot,
      ...consentFields(consentAccepted, null),
    },
  });

  return {
    action: 'created',
    profileId: profile.id,
    source: profile.source,
    readerType: profile.readerType,
    status: profile.status,
  };
}

module.exports = {
  READERS_AGREE_V2_SOURCE,
  PROSPECT_TYPE,
  deriveChannel,
  resolveCaptureSurface,
  resolveRetailerOrigin,
  buildLeadAttributionSnapshot,
  createLabelsForNewProfile,
  syncReadersAgreeLeadProfile,
};
