/**
 * Complimentary ebook review copies.
 * These rows are not Purchase, Order, Ledger, referral, or promotional-consent records.
 * A download is authorized only when this specific grant is active, unexpired, and unrevoked.
 */

const { normalizeEmail } = require('../src/lib/normalize.cjs');

const TITLE_KEY = 'the-agnes-protocol';
const TITLE = 'The Agnes Protocol';
const DISPLAY_LABEL = 'Complimentary — distributor evaluation';
const PURPOSE_TOKEN = 'complimentary_ebook';
const GRANT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value) {
  const text = String(value || '').trim();
  return text || null;
}

function publicGrant(grant) {
  if (!grant) return null;
  return {
    id: grant.id,
    email: grant.email,
    recipientName: grant.recipientName,
    company: grant.company || null,
    role: grant.role || null,
    purpose: grant.purpose,
    title: grant.title,
    titleKey: grant.titleKey,
    status: grant.revokedAt ? 'revoked' : grant.status,
    expiresAt: grant.expiresAt instanceof Date ? grant.expiresAt.toISOString() : grant.expiresAt,
    revokedAt: grant.revokedAt instanceof Date ? grant.revokedAt.toISOString() : grant.revokedAt || null,
    createdAt: grant.createdAt instanceof Date ? grant.createdAt.toISOString() : grant.createdAt,
    displayLabel: DISPLAY_LABEL,
  };
}

function grantExpired(grant, now) {
  const expires = grant.expiresAt instanceof Date ? grant.expiresAt : new Date(grant.expiresAt);
  return Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime();
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 * @param {Date} [now]
 */
async function createComplimentaryEbookGrant(prisma, input = {}, now = new Date()) {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: 'invalid_email' };
  const recipientName = clean(input.recipientName);
  const purpose = clean(input.purpose);
  const contactStreet = clean(input.contactStreet);
  const contactCity = clean(input.contactCity);
  const contactState = clean(input.contactState);
  const contactZip = clean(input.contactZip);
  const contactCountry = clean(input.contactCountry);
  if (!recipientName || !purpose) {
    return { ok: false, error: 'missing_contact' };
  }
  if (input.titleKey && String(input.titleKey).trim() !== TITLE_KEY) {
    return { ok: false, error: 'unsupported_title' };
  }

  const existing = await prisma.complimentaryEbookGrant.findFirst({
    where: { email, titleKey: TITLE_KEY, revokedAt: null },
  });
  if (existing) {
    return { ok: true, created: false, grant: publicGrant(existing) };
  }

  const data = {
    email,
    recipientName,
    company: clean(input.company),
    role: clean(input.role),
    contactStreet,
    contactCity,
    contactState,
    contactZip,
    contactCountry,
    deliveryInstruction: clean(input.deliveryInstruction),
    purpose,
    title: TITLE,
    titleKey: TITLE_KEY,
    status: 'active',
    expiresAt: new Date(now.getTime() + GRANT_DAYS * DAY_MS),
  };

  try {
    const grant = await prisma.complimentaryEbookGrant.create({ data });
    return { ok: true, created: true, grant: publicGrant(grant) };
  } catch (err) {
    if (!err || err.code !== 'P2002') throw err;
    const again = await prisma.complimentaryEbookGrant.findFirst({
      where: { email, titleKey: TITLE_KEY, revokedAt: null },
    });
    if (!again) throw err;
    return { ok: true, created: false, grant: publicGrant(again) };
  }
}

async function authorizeComplimentaryEbookDownload(prisma, payload, now = new Date()) {
  if (!payload || payload.purpose !== PURPOSE_TOKEN || !payload.grantId) {
    return { ok: false, reason: 'not_complimentary' };
  }
  const email = normalizeEmail(payload.email);
  if (!email) return { ok: false, reason: 'not_complimentary' };
  const grant = await prisma.complimentaryEbookGrant.findUnique({
    where: { id: String(payload.grantId) },
  });
  if (!grant) return { ok: false, reason: 'grant_not_found' };
  if (grant.email !== email) return { ok: false, reason: 'email_mismatch' };
  if (grant.revokedAt || grant.status !== 'active') return { ok: false, reason: 'revoked' };
  if (grantExpired(grant, now)) return { ok: false, reason: 'expired' };
  return { ok: true, reason: 'active', grantId: grant.id };
}

async function revokeComplimentaryEbookGrant(prisma, grantId, now = new Date()) {
  const id = String(grantId || '').trim();
  if (!id) return { ok: false, error: 'grant_not_found' };
  const grant = await prisma.complimentaryEbookGrant.findUnique({ where: { id } });
  if (!grant) return { ok: false, error: 'grant_not_found' };
  if (grant.revokedAt) return { ok: true, grant: publicGrant(grant) };
  const updated = await prisma.complimentaryEbookGrant.update({
    where: { id },
    data: { status: 'revoked', revokedAt: now },
  });
  return { ok: true, grant: publicGrant(updated) };
}

function ledgerLabel(grant) {
  const purpose = clean(grant && grant.purpose);
  if (purpose && !/distributor evaluation/i.test(purpose)) {
    return `Complimentary — ${purpose}`;
  }
  return DISPLAY_LABEL;
}

function complimentaryLedgerRow(grant) {
  const created = grant.createdAt instanceof Date ? grant.createdAt : new Date(grant.createdAt);
  return {
    rowKind: 'complimentary',
    orderDate: created.toISOString(),
    buyerName: grant.recipientName,
    buyerEmail: grant.email,
    productType: 'ebook',
    productTypeLabel: 'eBook',
    amount: '$0.00 USD',
    saleStatus: 'complimentary',
    saleStatusLabel: ledgerLabel(grant),
    shippingStatusLabel: 'N/A',
    shippingStatusKey: 'na',
    countsForPoints: false,
    countsForPointsLabel: 'No',
    countsForShipping: false,
    countsForShippingLabel: 'No',
    sessionId: '—',
    orderId: null,
    purchaseId: null,
    grantId: grant.id,
    userId: null,
  };
}

function complimentaryRowVisible(row, filters) {
  const product = filters.productFilter || 'all';
  const saleStatus = filters.saleStatusFilter || 'all';
  const shipping = filters.shippingFilter || 'all';
  if (product !== 'all' && product !== 'ebook') return false;
  if (saleStatus !== 'all' && saleStatus !== 'complimentary') return false;
  if (shipping !== 'all' && shipping !== row.shippingStatusKey) return false;
  return true;
}

module.exports = {
  TITLE_KEY,
  TITLE,
  DISPLAY_LABEL,
  PURPOSE_TOKEN,
  GRANT_DAYS,
  createComplimentaryEbookGrant,
  authorizeComplimentaryEbookDownload,
  revokeComplimentaryEbookGrant,
  complimentaryLedgerRow,
  complimentaryRowVisible,
  ledgerLabel,
  publicGrant,
};
