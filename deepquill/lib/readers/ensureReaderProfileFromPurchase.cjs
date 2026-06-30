const { isMailableEmail } = require('../../src/lib/normalize.cjs');
const { ARCHIVED_SALE_STATUS } = require('../archivedBetaPurchases.cjs');
const { appendNotes } = require('./readerUser.cjs');

const AUTO_READER_SOURCE = 'Website';
const AUTO_READER_TYPE = 'purchased';

function formatPurchaseNoteLine({ product, purchasedAt, sessionId, archivedBeta }) {
  const date =
    purchasedAt instanceof Date
      ? purchasedAt.toISOString().slice(0, 10)
      : String(purchasedAt || '').slice(0, 10) || 'unknown date';
  const prod = (product || 'unknown').trim();
  const archived = archivedBeta ? ' [archived beta]' : '';
  return `Purchased ${prod} via Stripe checkout on ${date} (session ${sessionId})${archived}.`;
}

function notesContainSession(notes, sessionId) {
  if (!notes || !sessionId) return false;
  return notes.includes(sessionId);
}

async function resolveProductForSession(prisma, sessionId) {
  if (!sessionId) return null;

  const conversion = await prisma.referralConversion.findUnique({
    where: { stripeSessionId: sessionId },
    select: { product: true },
  });
  if (conversion?.product) return conversion.product;

  const ledger = await prisma.ledger.findFirst({
    where: { sessionId, type: 'PURCHASE_RECORDED' },
    select: { meta: true },
    orderBy: { createdAt: 'desc' },
  });
  const metaProduct = ledger?.meta && typeof ledger.meta === 'object' ? ledger.meta.product : null;
  if (typeof metaProduct === 'string' && metaProduct.trim()) return metaProduct.trim();

  return null;
}

async function isEligiblePurchaserUser(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return { ok: false, reason: 'user_not_found' };

  const email = isMailableEmail(user.email);
  if (!email) return { ok: false, reason: 'non_mailable_email' };
  if (email.endsWith('@example.com')) return { ok: false, reason: 'example_email' };

  const fulfillmentStaff = await prisma.fulfillmentUser.findUnique({
    where: { email },
    select: { id: true },
  });
  if (fulfillmentStaff) return { ok: false, reason: 'fulfillment_staff' };

  return { ok: true, user, email };
}

/**
 * Create or update ReaderProfile for a single purchase (idempotent per sessionId in notes).
 * Never overwrites existing source or readerType when set; appends purchase lines only.
 */
async function ensureReaderProfileFromPurchase(
  prisma,
  { userId, sessionId, product, purchasedAt, saleStatus, dryRun = false },
) {
  if (!userId || !sessionId) {
    return { action: 'skipped', reason: 'missing_user_or_session' };
  }

  const eligibility = await isEligiblePurchaserUser(prisma, userId);
  if (!eligibility.ok) {
    return { action: 'skipped', reason: eligibility.reason, userId, sessionId };
  }

  const resolvedProduct = product || (await resolveProductForSession(prisma, sessionId));
  const archivedBeta = saleStatus === ARCHIVED_SALE_STATUS;
  const noteLine = formatPurchaseNoteLine({
    product: resolvedProduct,
    purchasedAt: purchasedAt || new Date(),
    sessionId,
    archivedBeta,
  });

  let profile = await prisma.readerProfile.findUnique({ where: { userId } });

  if (profile && notesContainSession(profile.notes, sessionId)) {
    return { action: 'skipped', reason: 'already_logged', userId, sessionId };
  }

  if (dryRun) {
    return {
      action: profile ? 'would_update' : 'would_create',
      userId,
      sessionId,
    };
  }

  if (!profile) {
    profile = await prisma.readerProfile.create({
      data: {
        userId,
        readerType: AUTO_READER_TYPE,
        source: AUTO_READER_SOURCE,
        notes: appendNotes(null, noteLine),
        status: 'active',
      },
    });
    return { action: 'created', userId, sessionId, profileId: profile.id };
  }

  const data = {
    notes: appendNotes(profile.notes, noteLine),
  };
  if (!profile.readerType) data.readerType = AUTO_READER_TYPE;
  if (!profile.source) data.source = AUTO_READER_SOURCE;

  profile = await prisma.readerProfile.update({
    where: { id: profile.id },
    data,
  });

  return { action: 'updated', userId, sessionId, profileId: profile.id };
}

/** Fire-and-forget CRM sync — must not fail the Stripe webhook. */
function trySyncReaderProfileFromPurchase(prisma, params) {
  ensureReaderProfileFromPurchase(prisma, params).catch((err) => {
    console.warn('[READER_CRM] sync failed (non-blocking)', {
      userId: params?.userId,
      sessionId: params?.sessionId,
      error: err?.message || String(err),
    });
  });
}

module.exports = {
  AUTO_READER_SOURCE,
  AUTO_READER_TYPE,
  formatPurchaseNoteLine,
  notesContainSession,
  resolveProductForSession,
  isEligiblePurchaserUser,
  ensureReaderProfileFromPurchase,
  trySyncReaderProfileFromPurchase,
};
