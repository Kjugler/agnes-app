#!/usr/bin/env node
/**
 * Complimentary ebook grants stay out of Purchase classification and paid totals.
 * A download requires the specific active grant. Unpaid Stripe sessions do not entitle.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.FULFILLMENT_TOKEN_SECRET = process.env.FULFILLMENT_TOKEN_SECRET || 'complimentary-grant-test-secret-32';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_complimentary_grant_check';

const { classifyReader, OWNERSHIP } = require('../lib/readers/classifyReader.cjs');
const { paidCheckoutEntitlesEbook } = require('../lib/ebookEntitlement.cjs');
const { wherePurchaseCountsForProductionMetrics } = require('../lib/archivedBetaPurchases.cjs');
const {
  createComplimentaryEbookGrant,
  authorizeComplimentaryEbookDownload,
  revokeComplimentaryEbookGrant,
  complimentaryLedgerRow,
  complimentaryRowVisible,
  ledgerLabel,
  DISPLAY_LABEL,
} = require('../lib/complimentaryEbookGrant.cjs');
const { signComplimentaryEbookToken, verifyToken, signToken } = require('../src/lib/fulfillmentToken.cjs');
const { buildEbookFulfillmentEmail } = require('../src/lib/fulfillmentEmail.cjs');
const { sendComplimentaryEbookLink } = require('../lib/email/sendComplimentaryEbookLink.cjs');

const MARTY = {
  email: 'm.flanagan@wfsllc.com',
  recipientName: 'Marty Flanagan',
  company: 'APG Sales & Distribution',
  role: 'President',
  contactStreet: '1501 County Hospital Road',
  contactCity: 'Nashville',
  contactState: 'TN',
  contactZip: '37218',
  contactCountry: 'USA',
  deliveryInstruction: 'Marty Flanagan — Front Door Entrance',
  purpose: 'Complimentary distributor evaluation copy of The Agnes Protocol.',
};

function memoryPrisma() {
  const grants = [];
  const sends = [];
  const forbidden = (name) => () => {
    throw new Error(`forbidden_${name}`);
  };
  return {
    grants,
    sends,
    complimentaryEbookGrant: {
      async findFirst({ where }) {
        return grants.find((row) => row.email === where.email && row.titleKey === where.titleKey && row.revokedAt == null) || null;
      },
      async findUnique({ where }) {
        return grants.find((row) => row.id === where.id) || null;
      },
      async create({ data }) {
        if (grants.some((row) => row.email === data.email && row.titleKey === data.titleKey && row.revokedAt == null)) {
          const err = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        const row = { ...data, id: `grant-${grants.length + 1}`, createdAt: new Date('2026-11-03T20:00:00.000Z') };
        grants.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = grants.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    complimentaryEbookSend: {
      async create({ data }) {
        const stored = { ...data };
        sends.push(stored);
        return stored;
      },
    },
    purchase: { create: forbidden('purchase'), findMany: forbidden('purchase_read') },
    user: { create: forbidden('user') },
    customer: { create: forbidden('customer') },
    order: { create: forbidden('order') },
    readerProfile: { create: forbidden('profile') },
    ledger: { create: forbidden('ledger') },
    referralConversion: { create: forbidden('referral') },
  };
}

async function main() {
  const liveBuyer = classifyReader({
    userId: 'buyer',
    email: 'buyer@example.com',
    purchases: [{ saleStatus: 'live', purchasedAt: '2026-11-01T00:00:00.000Z' }],
    evidence: [],
  });
  assert.strictEqual(liveBuyer.ownership, OWNERSHIP.PURCHASER);
  const metrics = wherePurchaseCountsForProductionMetrics();
  assert.strictEqual(metrics.countsForPoints, true);
  assert.deepStrictEqual(metrics.saleStatus, { not: 'archived_beta' });

  const unpaid = paidCheckoutEntitlesEbook({ payment_status: 'unpaid', amount_total: 0 }, 'ebook');
  assert.strictEqual(unpaid, false);
  assert.strictEqual(paidCheckoutEntitlesEbook(null, 'ebook'), false);
  assert.strictEqual(paidCheckoutEntitlesEbook({ amount_total: 0 }, 'ebook'), false);
  assert.strictEqual(paidCheckoutEntitlesEbook({ payment_status: 'paid', amount_total: 2195 }, 'ebook'), true);
  assert.strictEqual(paidCheckoutEntitlesEbook({ payment_status: 'paid', amount_total: 2600 }, 'paperback'), true);
  assert.strictEqual(paidCheckoutEntitlesEbook({ payment_status: 'paid', amount_total: 1800 }, 'audio_preorder'), false);

  const prisma = memoryPrisma();
  const now = new Date('2026-11-03T20:00:00.000Z');
  const created = await createComplimentaryEbookGrant(prisma, MARTY, now);
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.created, true);
  const again = await createComplimentaryEbookGrant(prisma, MARTY, now);
  assert.strictEqual(again.created, false);
  assert.strictEqual(again.grant.id, created.grant.id);
  assert.strictEqual(prisma.grants.length, 1);
  assert.strictEqual(prisma.sends.length, 0);
  assert.strictEqual(created.grant.displayLabel, DISPLAY_LABEL);

  const reader = classifyReader({
    userId: 'marty',
    email: MARTY.email,
    purchases: [],
    evidence: [],
  });
  assert.notStrictEqual(reader.ownership, OWNERSHIP.PURCHASER);

  const row = complimentaryLedgerRow(prisma.grants[0]);
  assert.strictEqual(row.amount, '$0.00 USD');
  assert.strictEqual(row.productType, 'ebook');
  assert.strictEqual(row.saleStatusLabel, 'Complimentary — distributor evaluation');
  assert.strictEqual(ledgerLabel({ purpose: 'author ebook swap' }), 'Complimentary — author ebook swap');

  const bill = memoryPrisma();
  const swap = await createComplimentaryEbookGrant(bill, {
    email: 'Bill.Joyce@vismgt.com',
    recipientName: 'Bill Joyce',
    purpose: 'author ebook swap',
  }, now);
  assert.strictEqual(swap.created, true);
  assert.strictEqual(swap.grant.email, 'bill.joyce@vismgt.com');
  assert.strictEqual(swap.grant.purpose, 'author ebook swap');
  assert.strictEqual(bill.grants[0].contactStreet, null);
  const swapAgain = await createComplimentaryEbookGrant(bill, {
    email: 'bill.joyce@vismgt.com',
    recipientName: 'Bill Joyce',
    purpose: 'author ebook swap',
  }, now);
  assert.strictEqual(swapAgain.created, false);
  assert.strictEqual(swapAgain.grant.id, swap.grant.id);
  assert.strictEqual(bill.grants.length, 1);
  assert.strictEqual(bill.sends.length, 0);
  assert.strictEqual(complimentaryLedgerRow(bill.grants[0]).saleStatusLabel, 'Complimentary — author ebook swap');
  assert.strictEqual(complimentaryLedgerRow(bill.grants[0]).productType, 'ebook');
  assert.strictEqual(row.countsForPoints, false);
  assert.strictEqual(row.countsForShipping, false);
  assert.strictEqual(row.orderId, null);
  assert.strictEqual(row.purchaseId, null);
  assert.strictEqual(complimentaryRowVisible(row, { productFilter: 'ebook', saleStatusFilter: 'all', shippingFilter: 'na' }), true);
  assert.strictEqual(complimentaryRowVisible(row, { productFilter: 'all', saleStatusFilter: 'live', shippingFilter: 'all' }), false);

  const paidPurchases = [{ amount: 2195, saleStatus: 'live', countsForPoints: true }];
  const paidCents = paidPurchases
    .filter((purchase) => purchase.saleStatus !== 'archived_beta' && purchase.countsForPoints !== false)
    .reduce((sum, purchase) => sum + purchase.amount, 0);
  assert.strictEqual(paidCents, 2195);

  const missing = await authorizeComplimentaryEbookDownload(prisma, {
    purpose: 'complimentary_ebook',
    grantId: 'missing',
    email: MARTY.email,
    amount: 0,
    sessionId: null,
  }, now);
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.reason, 'grant_not_found');
  assert.strictEqual((await authorizeComplimentaryEbookDownload(prisma, { amount: 0 }, now)).reason, 'not_complimentary');

  const active = await authorizeComplimentaryEbookDownload(prisma, {
    purpose: 'complimentary_ebook',
    grantId: created.grant.id,
    email: MARTY.email,
  }, now);
  assert.strictEqual(active.ok, true);

  const token = signComplimentaryEbookToken({ email: MARTY.email, grantId: created.grant.id }, { ttlSeconds: 3600 });
  const verified = verifyToken(token);
  assert.strictEqual(verified.purpose, 'complimentary_ebook');
  assert.strictEqual(verified.grantId, created.grant.id);
  assert.ok(!Object.prototype.hasOwnProperty.call(verified, 'typ'));
  const expiredToken = signComplimentaryEbookToken(
    { email: MARTY.email, grantId: created.grant.id },
    { now: new Date('2026-11-01T00:00:00.000Z'), ttlSeconds: 60 },
  );
  assert.strictEqual(verifyToken(expiredToken), null);

  const paidToken = signToken({ email: 'buyer@example.com', sessionId: 'cs_live_paid' });
  const paidPayload = verifyToken(paidToken);
  assert.strictEqual(paidPayload.sessionId, 'cs_live_paid');
  assert.strictEqual(paidPayload.purpose, undefined);

  prisma.grants[0].expiresAt = new Date('2026-11-01T00:00:00.000Z');
  const expiredGrant = await authorizeComplimentaryEbookDownload(prisma, {
    purpose: 'complimentary_ebook',
    grantId: created.grant.id,
    email: MARTY.email,
  }, now);
  assert.strictEqual(expiredGrant.reason, 'expired');
  prisma.grants[0].expiresAt = new Date('2027-02-01T00:00:00.000Z');

  await revokeComplimentaryEbookGrant(prisma, created.grant.id, now);
  const revoked = await authorizeComplimentaryEbookDownload(prisma, {
    purpose: 'complimentary_ebook',
    grantId: created.grant.id,
    email: MARTY.email,
  }, now);
  assert.strictEqual(revoked.reason, 'revoked');

  const fresh = memoryPrisma();
  const open = await createComplimentaryEbookGrant(fresh, MARTY, now);
  let sentBody = null;
  const sendResult = await sendComplimentaryEbookLink(fresh, open.grant.id, {
    now,
    siteUrl: 'https://www.theagnesprotocol.com',
    async send(message) {
      sentBody = message;
      return { ok: true, deliveryStatus: 'sent', providerMessageId: 'provider-1' };
    },
  });
  assert.strictEqual(sendResult.ok, true);
  assert.strictEqual(sendResult.deliveryStatus, 'sent');
  assert.strictEqual(fresh.sends.length, 1);
  assert.strictEqual(fresh.sends[0].outcome, 'sent');
  assert.strictEqual(fresh.sends[0].providerMessageId, 'provider-1');
  const logged = JSON.stringify(fresh.sends[0]);
  assert.ok(!logged.includes('token'));
  assert.ok(!logged.includes('download'));
  assert.ok(sentBody.html.includes('not a purchase'));
  assert.ok(!sentBody.html.toLowerCase().includes('thank you for purchasing'));
  assert.ok(sentBody.meta.grantId);
  assert.ok(!JSON.stringify(sentBody.meta).includes('token'));

  const copy = buildEbookFulfillmentEmail({
    email: MARTY.email,
    downloadUrl: 'https://example.invalid/ebook',
    mode: 'complimentary_review',
  });
  assert.ok(copy.subject.includes('complimentary review copy'));

  const downloadRoute = fs.readFileSync(path.join(__dirname, '../api/ebook-download.cjs'), 'utf8');
  assert.ok(downloadRoute.includes('paidCheckoutEntitlesEbook'));
  assert.ok(downloadRoute.includes('payment_not_completed'));
  assert.ok(downloadRoute.includes('authorizeComplimentaryEbookDownload'));
  const createRoute = fs.readFileSync(path.join(__dirname, '../server/routes/adminComplimentaryEbook.cjs'), 'utf8');
  const createHandler = createRoute.slice(
    createRoute.indexOf("router.post('/',"),
    createRoute.indexOf("router.post('/:grantId/send-link'"),
  );
  assert.ok(createHandler.includes('createComplimentaryEbookGrant'));
  assert.ok(!createHandler.includes('sendComplimentaryEbookLink'));

  console.log('verify-complimentary-ebook-grant: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
