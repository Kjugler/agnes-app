/**
 * Reader Manager Phase 1 Checkpoint 3A — read-only lifecycle service.
 *
 * Maps existing User/ReaderProfile/Purchase plus lifecycle tables into
 * classifyReader(). Performs no writes. Not mounted as an API.
 *
 * Contactability uses the latest manual ReaderContactDecision only.
 * `contactable` means no manual DNC and a mailable address in local data.
 * Provider unsubscribe/reject/complaint is NOT integrated; not safe to send.
 */
const { classifyReader } = require('./classifyReader.cjs');
const { displayName } = require('./readerUser.cjs');
const { displayReaderEmail } = require('./readerSyntheticEmail.cjs');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SCAN_BATCH = 150;
const SAFETY_SCAN_LIMIT = 8000;

const WRITE_METHODS = Object.freeze([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);
const RAW_CLIENT_METHODS = Object.freeze([
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
  'executeRaw',
  'queryRaw',
]);
const CONTACTABLE_MEANS =
  'No manual DNC and a mailable address according to locally available data; provider unsubscribe/reject/complaint status has not yet been integrated.';

const PROFILE_ORDER = Object.freeze([{ createdAt: 'desc' }, { id: 'desc' }]);
const USER_SELECT = Object.freeze({
  id: true,
  email: true,
  phone: true,
  fname: true,
  lname: true,
  firstName: true,
  createdAt: true,
});
const PURCHASE_SELECT = Object.freeze({
  id: true,
  userId: true,
  sessionId: true,
  amount: true,
  currency: true,
  source: true,
  createdAt: true,
  saleStatus: true,
  fulfillmentStatus: true,
  countsForShipping: true,
  countsForPoints: true,
});

const CONTACTABILITY_SCOPE = Object.freeze({
  manualDecisionApplied: true,
  providerSuppressionIntegrated: false,
  contactableMeans: CONTACTABLE_MEANS,
  safeToSend: false,
  notForSendingSystems: true,
  note: `contactable currently means: ${CONTACTABLE_MEANS} This result must not be consumed by any sending system.`,
});

function denyReadOnly(label) {
  return () => {
    throw new Error(`read-only prisma: ${label} is not allowed`);
  };
}

function asReadOnlyPrisma(prisma) {
  if (!prisma || typeof prisma !== 'object') {
    throw new Error('prisma client is required');
  }
  const delegateCache = new Map();
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && RAW_CLIENT_METHODS.includes(prop)) {
        return denyReadOnly(prop);
      }
      const value = Reflect.get(target, prop, receiver);
      if (
        value &&
        typeof value === 'object' &&
        typeof prop === 'string' &&
        !prop.startsWith('$') &&
        !prop.startsWith('_')
      ) {
        if (!delegateCache.has(prop)) {
          delegateCache.set(
            prop,
            new Proxy(value, {
              get(delegate, method, rec) {
                if (typeof method === 'string' && WRITE_METHODS.includes(method)) {
                  return denyReadOnly(`${prop}.${method}`);
                }
                const fn = Reflect.get(delegate, method, rec);
                return typeof fn === 'function' ? fn.bind(delegate) : fn;
              },
            }),
          );
        }
        return delegateCache.get(prop);
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function clampPageSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.floor(n));
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function descAfter(createdAt, id, cursor) {
  if (!cursor || !cursor.createdAt || !cursor.id) return {};
  const at = new Date(cursor.createdAt);
  return {
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor.id } }],
  };
}

function iso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function latestDecision(decisions) {
  const rows = Array.isArray(decisions) ? [...decisions] : [];
  rows.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (ta !== 0) return ta;
    return String(a.id).localeCompare(String(b.id));
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function manualDoNotContact(decisions) {
  const latest = latestDecision(decisions);
  if (!latest) return false;
  return String(latest.decision).toLowerCase() === 'suppress';
}

function hasOpenIdentityReview(reviews, userId) {
  return (reviews || []).some(
    (row) =>
      String(row.status).toLowerCase() === 'open' &&
      (row.primaryUserId === userId || row.otherUserId === userId),
  );
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

function searchTerm(q) {
  return typeof q === 'string' ? q.trim().toLowerCase() : '';
}

function lowerIncludes(value, term) {
  return String(value || '')
    .toLowerCase()
    .includes(term);
}

function matchesSearch(user, q) {
  const term = searchTerm(q);
  if (!term) return true;
  return [
    user && user.email,
    user && user.fname,
    user && user.lname,
    user && user.firstName,
    user && user.phone,
    displayName(user || {}),
  ].some((value) => lowerIncludes(value, term));
}

function matchesCommunicationSearch(row, q) {
  const term = searchTerm(q);
  if (!term) return true;
  const user = row.user || {};
  return [
    row.recipientEmailSnapshot,
    row.caption,
    user.email,
    user.fname,
    user.lname,
    user.firstName,
    displayName(user),
  ].some((value) => lowerIncludes(value, term));
}

function profileWhere(options) {
  const where = {};
  if (options.source && options.source !== 'all') where.source = options.source;
  if (options.status && options.status !== 'all') where.status = options.status;
  else if (!options.includeArchived) where.status = { not: 'archived' };
  return where;
}

function hasDerivedFilters(options) {
  return Boolean(
    options.ownership ||
      options.confidence ||
      options.contactability ||
      options.review ||
      options.purchaseSource ||
      options.reason,
  );
}

function needsScan(options) {
  return Boolean(searchTerm(options.q) || hasDerivedFilters(options));
}

function matchesDerived(item, options) {
  if (options.ownership && item.ownership !== options.ownership) return false;
  if (options.confidence && item.confidence !== options.confidence) return false;
  if (options.contactability && item.contactability !== options.contactability) return false;
  if (options.review && item.review !== options.review) return false;
  if (options.purchaseSource && !(item.sources || []).includes(options.purchaseSource)) return false;
  if (options.reason && !(item.reasons || []).includes(options.reason)) return false;
  return true;
}

function honestCommunicationSummary(row) {
  if (!row) return null;
  const outcome = row.outcome || 'unknown';
  return {
    id: row.id,
    occurredAt: iso(row.occurredAt),
    category: row.category,
    templateOrAskId: row.templateOrAskId || null,
    outcome,
    trigger: row.trigger,
    source: row.source,
    caption: row.caption || null,
    deliveryKnown: false,
    deliveryNote:
      outcome === 'recorded_sent_delivery_unknown'
        ? 'Historical or reconstructed send recorded; delivery is unknown.'
        : 'This row records an attempt or history item, not proof of inbox delivery.',
  };
}

function serializePurchase(row) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    createdAt: iso(row.createdAt),
    amount: row.amount == null ? null : row.amount,
    currency: row.currency || null,
    source: row.source || null,
    saleStatus: row.saleStatus || 'live',
    fulfillmentStatus: row.fulfillmentStatus || null,
    countsForShipping: Boolean(row.countsForShipping),
    countsForPoints: Boolean(row.countsForPoints),
    accountingTruth: true,
  };
}

function serializeEvidence(row) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    sourceLabel: row.sourceLabel || null,
    purchaseDate: iso(row.purchaseDate),
    stripeSessionId: row.stripeSessionId || null,
    details: row.details || null,
    reason: row.reason,
    actorType: row.actorType,
    actorLabel: row.actorLabel,
    origin: row.origin,
    originRef: row.originRef,
    supersededById: row.supersededById || null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    accountingTruth: false,
  };
}

async function loadRelated(db, userIds) {
  if (!userIds.length) {
    return {
      purchasesByUser: new Map(),
      evidenceByUser: new Map(),
      commsByUser: new Map(),
      reviewsByUser: new Map(),
      decisionsByUser: new Map(),
      purchaseBySession: new Map(),
    };
  }
  const [purchases, evidence, comms, reviewsPrimary, reviewsOther, decisions] = await Promise.all([
    db.purchase.findMany({ where: { userId: { in: userIds } }, select: PURCHASE_SELECT }),
    db.readerEvidence.findMany({ where: { userId: { in: userIds } } }),
    db.readerCommunication.findMany({ where: { userId: { in: userIds } } }),
    db.readerIdentityReview.findMany({ where: { primaryUserId: { in: userIds } } }),
    db.readerIdentityReview.findMany({ where: { otherUserId: { in: userIds } } }),
    db.readerContactDecision.findMany({ where: { userId: { in: userIds } } }),
  ]);

  const sessionIds = [...new Set(evidence.map((row) => row.stripeSessionId).filter(Boolean))];
  const extraSessions = sessionIds.filter((id) => !purchases.some((p) => p.sessionId === id));
  const extraPurchases = extraSessions.length
    ? await db.purchase.findMany({
        where: { sessionId: { in: extraSessions } },
        select: { sessionId: true, userId: true },
      })
    : [];
  const purchaseBySession = new Map(
    [...purchases, ...extraPurchases].map((row) => [row.sessionId, row]),
  );

  const reviews = [...reviewsPrimary, ...reviewsOther];
  const reviewsByUser = new Map();
  for (const userId of userIds) reviewsByUser.set(userId, []);
  for (const row of reviews) {
    if (row.primaryUserId && reviewsByUser.has(row.primaryUserId)) {
      reviewsByUser.get(row.primaryUserId).push(row);
    }
    if (row.otherUserId && reviewsByUser.has(row.otherUserId) && row.otherUserId !== row.primaryUserId) {
      reviewsByUser.get(row.otherUserId).push(row);
    }
  }

  return {
    purchasesByUser: groupBy(purchases, 'userId'),
    evidenceByUser: groupBy(evidence, 'userId'),
    commsByUser: groupBy(comms, 'userId'),
    reviewsByUser,
    decisionsByUser: groupBy(decisions, 'userId'),
    purchaseBySession,
  };
}

function buildClassifierInput(user, profile, related) {
  const userId = user.id;
  const purchases = related.purchasesByUser.get(userId) || [];
  const evidence = related.evidenceByUser.get(userId) || [];
  const reviews = related.reviewsByUser.get(userId) || [];
  const decisions = related.decisionsByUser.get(userId) || [];
  return {
    userId,
    email: user.email,
    doNotContact: manualDoNotContact(decisions),
    identityReviewRequired: hasOpenIdentityReview(reviews, userId),
    profile: profile
      ? { readerType: profile.readerType || null, source: profile.source || null }
      : null,
    purchases: purchases.map((row) => ({
      userId: row.userId,
      sessionId: row.sessionId,
      saleStatus: row.saleStatus,
      purchasedAt: row.createdAt,
    })),
    evidence: evidence.map((row) => {
      const linked = row.stripeSessionId ? related.purchaseBySession.get(row.stripeSessionId) : null;
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
  };
}

function toListItem(profile, user, related, classification) {
  const comms = [...(related.commsByUser.get(user.id) || [])].sort((a, b) => {
    const t = new Date(b.occurredAt) - new Date(a.occurredAt);
    if (t !== 0) return t;
    return String(b.id).localeCompare(String(a.id));
  });
  const displayEmail = displayReaderEmail(user.email);
  return {
    readerProfileId: profile.id,
    userId: user.id,
    name: displayName(user) || '',
    email: displayEmail || null,
    emailDisplay: displayEmail || 'no_mailable_email',
    hasRealEmail: Boolean(displayEmail),
    legacy: {
      source: profile.source || null,
      readerType: profile.readerType || null,
      status: profile.status || 'active',
    },
    ownership: classification.ownership,
    sources: classification.sources,
    confidence: classification.confidence,
    contactability: classification.contactability,
    review: classification.review,
    nurtureSuppressed: classification.nurtureSuppressed,
    reasons: classification.reasons,
    conflicts: classification.conflicts,
    latestCommunication: honestCommunicationSummary(comms[0]),
    openReview: hasOpenIdentityReview(related.reviewsByUser.get(user.id) || [], user.id),
    contactabilityScope: CONTACTABILITY_SCOPE,
    createdAt: iso(profile.createdAt),
  };
}

function classifyProfile(profile, related) {
  const classification = classifyReader(buildClassifierInput(profile.user, profile, related));
  return toListItem(profile, profile.user, related, classification);
}

async function listReaderLifecycle(prisma, options = {}) {
  const db = asReadOnlyPrisma(prisma);
  const pageSize = clampPageSize(options.pageSize);
  const cursor = decodeCursor(options.cursor);
  const where = profileWhere(options);
  const after = descAfter(null, null, cursor);

  if (!needsScan(options)) {
    const whereWithCursor = after.OR ? { AND: [where, after] } : where;
    const rows = await db.readerProfile.findMany({
      where: whereWithCursor,
      include: { user: { select: USER_SELECT } },
      orderBy: PROFILE_ORDER,
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    const related = await loadRelated(db, page.map((row) => row.userId));
    const items = page.map((row) => classifyProfile(row, related));
    const last = page[page.length - 1];
    return {
      items,
      pageSize,
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor({ createdAt: iso(last.createdAt), id: last.id })
          : null,
      hasMore: rows.length > pageSize,
      partial: false,
      totalCount: null,
    };
  }

  const items = [];
  let scanned = 0;
  let lastScanned = cursor;
  let exhausted = false;
  let scanCursor = cursor;

  while (items.length < pageSize && scanned < SAFETY_SCAN_LIMIT) {
    const whereWithCursor = scanCursor
      ? { AND: [where, descAfter(null, null, scanCursor)] }
      : where;
    const batch = await db.readerProfile.findMany({
      where: whereWithCursor,
      include: { user: { select: USER_SELECT } },
      orderBy: PROFILE_ORDER,
      take: SCAN_BATCH,
    });
    if (!batch.length) {
      exhausted = true;
      break;
    }
    const related = await loadRelated(db, batch.map((row) => row.userId));
    let filledPage = false;
    let consumedEntireBatch = true;
    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      scanned += 1;
      lastScanned = { createdAt: iso(row.createdAt), id: row.id };
      if (!matchesSearch(row.user, options.q)) continue;
      const item = classifyProfile(row, related);
      if (matchesDerived(item, options)) items.push(item);
      if (items.length >= pageSize) {
        filledPage = true;
        consumedEntireBatch = i === batch.length - 1;
        break;
      }
    }
    scanCursor = lastScanned;
    if (consumedEntireBatch && batch.length < SCAN_BATCH) {
      exhausted = true;
      break;
    }
    if (filledPage) break;
  }

  const filled = items.length >= pageSize;
  const hitSafety = !exhausted && !filled && scanned >= SAFETY_SCAN_LIMIT;
  const hasMore = (filled && !exhausted) || hitSafety;
  return {
    items: items.slice(0, pageSize),
    pageSize,
    nextCursor: hasMore && lastScanned ? encodeCursor(lastScanned) : null,
    hasMore,
    partial: hitSafety,
    scanned,
    totalCount: null,
  };
}

async function getReaderLifecycleDetail(prisma, options = {}) {
  const db = asReadOnlyPrisma(prisma);
  let profile = null;
  if (options.readerProfileId) {
    profile = await db.readerProfile.findUnique({
      where: { id: options.readerProfileId },
      include: { user: { select: USER_SELECT } },
    });
  } else if (options.userId) {
    profile = await db.readerProfile.findUnique({
      where: { userId: options.userId },
      include: { user: { select: USER_SELECT } },
    });
  }
  if (!profile) return null;
  const related = await loadRelated(db, [profile.userId]);
  const listItem = classifyProfile(profile, related);
  const evidence = [...(related.evidenceByUser.get(profile.userId) || [])].sort((a, b) => {
    const t = new Date(b.createdAt) - new Date(a.createdAt);
    if (t !== 0) return t;
    return String(b.id).localeCompare(String(a.id));
  });
  const purchases = [...(related.purchasesByUser.get(profile.userId) || [])].sort((a, b) => {
    const t = new Date(b.createdAt) - new Date(a.createdAt);
    if (t !== 0) return t;
    return String(b.id).localeCompare(String(a.id));
  });
  const communications = [...(related.commsByUser.get(profile.userId) || [])].sort((a, b) => {
    const t = new Date(b.occurredAt) - new Date(a.occurredAt);
    if (t !== 0) return t;
    return String(b.id).localeCompare(String(a.id));
  });
  const contactDecisions = [...(related.decisionsByUser.get(profile.userId) || [])].sort((a, b) => {
    const t = new Date(a.createdAt) - new Date(b.createdAt);
    if (t !== 0) return t;
    return String(a.id).localeCompare(String(b.id));
  });
  const identityReviews = [...(related.reviewsByUser.get(profile.userId) || [])].sort((a, b) => {
    const t = new Date(b.createdAt) - new Date(a.createdAt);
    if (t !== 0) return t;
    return String(b.id).localeCompare(String(a.id));
  });

  return {
    ...listItem,
    notes: profile.notes || '',
    phone: (profile.user.phone || '').trim(),
    smsConsentGranted: Boolean(profile.smsConsentGranted),
    evidenceHistory: evidence.map(serializeEvidence),
    purchases: purchases.map(serializePurchase),
    communications: communications.map((row) => ({
      ...honestCommunicationSummary(row),
      recipientEmailSnapshot: row.recipientEmailSnapshot || null,
      batchLabel: row.batchLabel || null,
      jobName: row.jobName || null,
      providerMessageId: row.providerMessageId || null,
    })),
    contactDecisions: contactDecisions.map((row) => ({
      id: row.id,
      decision: row.decision,
      reason: row.reason,
      actorType: row.actorType,
      actorLabel: row.actorLabel,
      origin: row.origin,
      originRef: row.originRef,
      createdAt: iso(row.createdAt),
    })),
    identityReviews: identityReviews.map((row) => ({
      id: row.id,
      primaryUserId: row.primaryUserId,
      otherUserId: row.otherUserId || null,
      reasonCode: row.reasonCode,
      details: row.details || null,
      status: row.status,
      resolutionReason: row.resolutionReason || null,
      resolvedAt: iso(row.resolvedAt),
      actorType: row.actorType,
      actorLabel: row.actorLabel,
      createdAt: iso(row.createdAt),
    })),
    distinctions: {
      purchasesAreAccountingTruth: true,
      evidenceIsLifecycleHistory: true,
      providerSuppressionIntegrated: false,
      contactableMeans: CONTACTABLE_MEANS,
      safeToSend: false,
      notForSendingSystems: true,
    },
  };
}

async function listPurchasesWithoutReaderProfile(prisma, options = {}) {
  const db = asReadOnlyPrisma(prisma);
  const pageSize = clampPageSize(options.pageSize);
  const cursor = decodeCursor(options.cursor);
  const after = descAfter(null, null, cursor);
  const where = after.OR
    ? { AND: [{ user: { readerProfile: { is: null } } }, after] }
    : { user: { readerProfile: { is: null } } };
  const rows = await db.purchase.findMany({
    where,
    include: { user: { select: USER_SELECT } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
  });
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      purchase: serializePurchase(row),
      userId: row.userId,
      userName: displayName(row.user) || '',
      email: displayReaderEmail(row.user.email) || null,
    })),
    pageSize,
    nextCursor:
      rows.length > pageSize && last
        ? encodeCursor({ createdAt: iso(last.createdAt), id: last.id })
        : null,
    hasMore: rows.length > pageSize,
    partial: false,
    totalCount: null,
  };
}

async function listReviewQueue(prisma, options = {}) {
  const kind = options.kind || 'incomplete';
  if (kind === 'purchase_without_profile') {
    return listPurchasesWithoutReaderProfile(prisma, options);
  }
  if (kind === 'identity_open') {
    const db = asReadOnlyPrisma(prisma);
    const pageSize = clampPageSize(options.pageSize);
    const cursor = decodeCursor(options.cursor);
    const after = descAfter(null, null, cursor);
    const where = after.OR
      ? { AND: [{ status: 'open' }, after] }
      : { status: 'open' };
    const rows = await db.readerIdentityReview.findMany({
      where,
      include: {
        primaryUser: { select: USER_SELECT },
        otherUser: { select: USER_SELECT },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        id: row.id,
        primaryUserId: row.primaryUserId,
        otherUserId: row.otherUserId || null,
        reasonCode: row.reasonCode,
        details: row.details || null,
        status: row.status,
        createdAt: iso(row.createdAt),
        primaryName: displayName(row.primaryUser) || '',
        otherName: row.otherUser ? displayName(row.otherUser) : '',
        automaticMerge: false,
      })),
      pageSize,
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor({ createdAt: iso(last.createdAt), id: last.id })
          : null,
      hasMore: rows.length > pageSize,
      partial: false,
      totalCount: null,
    };
  }

  const derived = { ...options };
  if (kind === 'conflicting') derived.review = 'conflicting';
  else if (kind === 'incomplete') derived.review = 'incomplete';
  else if (kind === 'legacy_purchased_without_evidence') {
    derived.reason = 'legacy_purchased_label_without_evidence';
  } else if (kind === 'archived_beta_only') {
    derived.reason = 'archived_purchase_only';
  }
  return listReaderLifecycle(prisma, derived);
}

function communicationSqlWhere(options) {
  const and = [];
  if (options.category) and.push({ category: options.category });
  if (options.outcome) and.push({ outcome: options.outcome });
  if (options.trigger) and.push({ trigger: options.trigger });
  if (options.from) and.push({ occurredAt: { gte: new Date(options.from) } });
  if (options.to) and.push({ occurredAt: { lte: new Date(options.to) } });
  return and;
}

function communicationInclude() {
  return {
    user: {
      select: {
        ...USER_SELECT,
        readerProfile: { select: { id: true } },
      },
    },
  };
}

function serializeCommunicationActivity(row) {
  return {
    ...honestCommunicationSummary(row),
    userId: row.userId,
    readerProfileId: row.user && row.user.readerProfile ? row.user.readerProfile.id : null,
    userName: displayName(row.user) || '',
    recipientEmailSnapshot: row.recipientEmailSnapshot || null,
  };
}

function occurredAfter(cursor) {
  if (!cursor || !cursor.occurredAt || !cursor.id) return {};
  const at = new Date(cursor.occurredAt);
  return {
    OR: [{ occurredAt: { lt: at } }, { occurredAt: at, id: { lt: cursor.id } }],
  };
}

async function listCommunicationActivity(prisma, options = {}) {
  const db = asReadOnlyPrisma(prisma);
  const pageSize = clampPageSize(options.pageSize);
  const cursor = decodeCursor(options.cursor);
  const filters = communicationSqlWhere(options);
  const searching = Boolean(searchTerm(options.q));

  if (!searching) {
    const after = occurredAfter(cursor);
    if (after.OR) filters.push(after);
    const where = filters.length ? { AND: filters } : {};
    const rows = await db.readerCommunication.findMany({
      where,
      include: communicationInclude(),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    const last = page[page.length - 1];
    return {
      items: page.map(serializeCommunicationActivity),
      pageSize,
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor({ occurredAt: iso(last.occurredAt), id: last.id })
          : null,
      hasMore: rows.length > pageSize,
      partial: false,
      totalCount: null,
    };
  }

  const items = [];
  let scanned = 0;
  let lastScanned = cursor;
  let exhausted = false;
  let scanCursor = cursor;

  while (items.length < pageSize && scanned < SAFETY_SCAN_LIMIT) {
    const after = occurredAfter(scanCursor);
    const whereParts = [...filters];
    if (after.OR) whereParts.push(after);
    const batch = await db.readerCommunication.findMany({
      where: whereParts.length ? { AND: whereParts } : {},
      include: communicationInclude(),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: SCAN_BATCH,
    });
    if (!batch.length) {
      exhausted = true;
      break;
    }
    let filledPage = false;
    let consumedEntireBatch = true;
    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      scanned += 1;
      lastScanned = { occurredAt: iso(row.occurredAt), id: row.id };
      if (!matchesCommunicationSearch(row, options.q)) continue;
      items.push(serializeCommunicationActivity(row));
      if (items.length >= pageSize) {
        filledPage = true;
        consumedEntireBatch = i === batch.length - 1;
        break;
      }
    }
    scanCursor = lastScanned;
    if (consumedEntireBatch && batch.length < SCAN_BATCH) {
      exhausted = true;
      break;
    }
    if (filledPage) break;
  }

  const filled = items.length >= pageSize;
  const hitSafety = !exhausted && !filled && scanned >= SAFETY_SCAN_LIMIT;
  const hasMore = (filled && !exhausted) || hitSafety;
  return {
    items: items.slice(0, pageSize),
    pageSize,
    nextCursor: hasMore && lastScanned ? encodeCursor(lastScanned) : null,
    hasMore,
    partial: hitSafety,
    scanned,
    totalCount: null,
  };
}

const AUDIT_SUMMARY_SCALAR_KEYS = Object.freeze([
  'id',
  'kind',
  'status',
  'sourceLabel',
  'purchaseDate',
  'supersededById',
  'decision',
  'reasonCode',
  'resolutionReason',
  'resolvedAt',
  'createdAt',
  'updatedAt',
  'actorType',
  'actorLabel',
  'actorId',
  'originalId',
]);
const AUDIT_SUMMARY_OBJECT_KEYS = Object.freeze(['replacement', 'opener', 'resolver']);
const AUDIT_DATE_KEYS = Object.freeze(['purchaseDate', 'createdAt', 'updatedAt', 'resolvedAt']);
const AUDIT_BLOCKED_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
const AUDIT_MAX_SUMMARY_DEPTH = 4;

function isOwnKey(object, key) {
  if (!object || typeof object !== 'object') return false;
  if (AUDIT_BLOCKED_KEYS.includes(key)) return false;
  return Object.prototype.hasOwnProperty.call(object, key);
}

function sanitizeAuditSummary(value) {
  try {
    return sanitizeAuditSummaryAt(value, 0);
  } catch {
    return null;
  }
}

function sanitizeAuditSummaryAt(value, depth) {
  if (value == null) return null;
  if (depth > AUDIT_MAX_SUMMARY_DEPTH) return null;
  if (typeof value !== 'object') return null;
  if (Array.isArray(value)) return null;
  if (value instanceof Date) return null;
  const out = {};
  for (const key of AUDIT_SUMMARY_SCALAR_KEYS) {
    if (!isOwnKey(value, key)) continue;
    let raw;
    try {
      raw = value[key];
    } catch {
      continue;
    }
    if (raw == null) {
      out[key] = null;
      continue;
    }
    if (Array.isArray(raw) || (typeof raw === 'object' && !(raw instanceof Date))) continue;
    if (AUDIT_DATE_KEYS.includes(key)) {
      const asIso = typeof raw === 'string' ? raw : iso(raw);
      if (asIso) out[key] = asIso;
      continue;
    }
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  for (const key of AUDIT_SUMMARY_OBJECT_KEYS) {
    if (!isOwnKey(value, key)) continue;
    let nested;
    try {
      nested = value[key];
    } catch {
      continue;
    }
    if (nested == null || typeof nested !== 'object' || Array.isArray(nested) || nested instanceof Date) {
      continue;
    }
    const cleaned = sanitizeAuditSummaryAt(nested, depth + 1);
    if (cleaned != null) out[key] = cleaned;
  }
  return Object.keys(out).length ? out : null;
}

function serializeAuditRow(row) {
  let before = null;
  let after = null;
  try {
    before = sanitizeAuditSummary(row && row.beforeJson);
  } catch {
    before = null;
  }
  try {
    after = sanitizeAuditSummary(row && row.afterJson);
  } catch {
    after = null;
  }
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId || null,
    actorType: row.actorType,
    actorLabel: row.actorLabel,
    actorId: row.actorId || null,
    reason: row.reason || null,
    before,
    after,
  };
}

async function listLifecycleActors(prisma) {
  const db = asReadOnlyPrisma(prisma);
  const rows = await db.fulfillmentUser.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return {
    actors: rows.map((row) => ({
      id: row.id,
      label: String(row.name || '').trim() || 'Unnamed helper',
    })),
  };
}

async function listReaderAuditHistory(prisma, options = {}) {
  const db = asReadOnlyPrisma(prisma);
  const readerProfileId = String(options.readerProfileId || '').trim();
  if (!readerProfileId) return null;
  const profile = await db.readerProfile.findUnique({
    where: { id: readerProfileId },
    select: { id: true, userId: true },
  });
  if (!profile) return null;
  const pageSize = clampPageSize(options.pageSize);
  const cursor = decodeCursor(options.cursor);
  const after = descAfter(null, null, cursor);
  const where = { relatedUserId: profile.userId };
  if (after.OR) where.AND = [after];
  const rows = await db.readerAdminAudit.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
  });
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    readerProfileId: profile.id,
    items: page.map(serializeAuditRow),
    pageSize,
    nextCursor:
      rows.length > pageSize && last
        ? encodeCursor({ createdAt: iso(last.createdAt), id: last.id })
        : null,
    hasMore: rows.length > pageSize,
    totalCount: null,
  };
}

module.exports = {
  listReaderLifecycle,
  getReaderLifecycleDetail,
  listReviewQueue,
  listCommunicationActivity,
  listPurchasesWithoutReaderProfile,
  listLifecycleActors,
  listReaderAuditHistory,
  sanitizeAuditSummary,
  asReadOnlyPrisma,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SCAN_BATCH,
  SAFETY_SCAN_LIMIT,
  CONTACTABILITY_SCOPE,
  CONTACTABLE_MEANS,
  WRITE_METHODS,
  RAW_CLIENT_METHODS,
  AUDIT_SUMMARY_SCALAR_KEYS,
  AUDIT_SUMMARY_OBJECT_KEYS,
  AUDIT_BLOCKED_KEYS,
  AUDIT_MAX_SUMMARY_DEPTH,
};
