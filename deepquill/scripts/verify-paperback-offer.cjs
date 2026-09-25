#!/usr/bin/env node
/**
 * Paperback Oct 2026 price + free-shipping window, fail-closed resolvers, dual Price IDs.
 * Usage: node scripts/verify-paperback-offer.cjs
 */
const assert = require('assert');
const {
  PAPERBACK_SALE_START_YMD,
  PAPERBACK_FREE_SHIPPING_END_YMD,
  isPaperbackSalePriceActive,
  isPaperbackFreeShippingWindow,
  getPaperbackCatalogPhase,
  resolvePaperbackPriceId,
  resolvePaperbackShippingRateId,
  isPaperbackPriceId,
} = require('../lib/paperbackOffer.cjs');
const { formatDenverYmd } = require('../lib/denverTime.cjs');

const BEFORE = new Date('2026-10-02T05:59:59.000Z'); // Oct 1 23:59:59 Denver
const START = new Date('2026-10-02T06:00:00.000Z'); // Oct 2 00:00 Denver
const LAST_FREE = new Date('2026-10-17T05:59:59.000Z'); // Oct 16 23:59:59 Denver
const AFTER = new Date('2026-10-17T06:00:00.000Z'); // Oct 17 00:00 Denver

assert.strictEqual(PAPERBACK_SALE_START_YMD, '2026-10-02');
assert.strictEqual(PAPERBACK_FREE_SHIPPING_END_YMD, '2026-10-16');
assert.strictEqual(formatDenverYmd(BEFORE), '2026-10-01');
assert.strictEqual(formatDenverYmd(START), '2026-10-02');
assert.strictEqual(formatDenverYmd(LAST_FREE), '2026-10-16');
assert.strictEqual(formatDenverYmd(AFTER), '2026-10-17');

assert.strictEqual(isPaperbackSalePriceActive(BEFORE), false);
assert.strictEqual(isPaperbackFreeShippingWindow(BEFORE), false);
assert.strictEqual(getPaperbackCatalogPhase(BEFORE), 'pre_sale');

assert.strictEqual(isPaperbackSalePriceActive(START), true);
assert.strictEqual(isPaperbackFreeShippingWindow(START), true);
assert.strictEqual(getPaperbackCatalogPhase(START), 'free_shipping');

assert.strictEqual(isPaperbackSalePriceActive(LAST_FREE), true);
assert.strictEqual(isPaperbackFreeShippingWindow(LAST_FREE), true);
assert.strictEqual(getPaperbackCatalogPhase(LAST_FREE), 'free_shipping');

assert.strictEqual(isPaperbackSalePriceActive(AFTER), true);
assert.strictEqual(isPaperbackFreeShippingWindow(AFTER), false);
assert.strictEqual(getPaperbackCatalogPhase(AFTER), 'sale_paid_shipping');

const ENV = {
  STRIPE_PRICE_PAPERBACK: 'price_legacy_2600',
  STRIPE_PRICE_PAPERBACK_2195: 'price_sale_2195',
  STRIPE_PAPERBACK_SHIPPING_RATE_ID: 'shr_paid_495',
  STRIPE_PAPERBACK_FREE_SHIPPING_RATE_ID: 'shr_free_0',
};

const beforePrice = resolvePaperbackPriceId(ENV, BEFORE);
assert.strictEqual(beforePrice.ok, true);
assert.strictEqual(beforePrice.priceId, 'price_legacy_2600');

const startPrice = resolvePaperbackPriceId(ENV, START);
assert.strictEqual(startPrice.ok, true);
assert.strictEqual(startPrice.priceId, 'price_sale_2195');

const lastFreePrice = resolvePaperbackPriceId(ENV, LAST_FREE);
assert.strictEqual(lastFreePrice.ok, true);
assert.strictEqual(lastFreePrice.priceId, 'price_sale_2195');

const afterPrice = resolvePaperbackPriceId(ENV, AFTER);
assert.strictEqual(afterPrice.ok, true);
assert.strictEqual(afterPrice.priceId, 'price_sale_2195');

const beforeShip = resolvePaperbackShippingRateId(ENV, BEFORE);
assert.strictEqual(beforeShip.ok, true);
assert.strictEqual(beforeShip.shippingRateId, 'shr_paid_495');

const startShip = resolvePaperbackShippingRateId(ENV, START);
assert.strictEqual(startShip.ok, true);
assert.strictEqual(startShip.shippingRateId, 'shr_free_0');

const lastFreeShip = resolvePaperbackShippingRateId(ENV, LAST_FREE);
assert.strictEqual(lastFreeShip.ok, true);
assert.strictEqual(lastFreeShip.shippingRateId, 'shr_free_0');

const afterShip = resolvePaperbackShippingRateId(ENV, AFTER);
assert.strictEqual(afterShip.ok, true);
assert.strictEqual(afterShip.shippingRateId, 'shr_paid_495');

const missingSale = resolvePaperbackPriceId(
  { ...ENV, STRIPE_PRICE_PAPERBACK_2195: null },
  START,
);
assert.strictEqual(missingSale.ok, false);
assert.strictEqual(missingSale.status, 500);
assert.match(missingSale.error, /sale price/i);

const missingFree = resolvePaperbackShippingRateId(
  { ...ENV, STRIPE_PAPERBACK_FREE_SHIPPING_RATE_ID: null },
  START,
);
assert.strictEqual(missingFree.ok, false);
assert.strictEqual(missingFree.status, 500);
assert.match(missingFree.error, /free shipping/i);

const missingFreeAfter = resolvePaperbackShippingRateId(
  { ...ENV, STRIPE_PAPERBACK_FREE_SHIPPING_RATE_ID: null },
  AFTER,
);
assert.strictEqual(missingFreeAfter.ok, true);
assert.strictEqual(missingFreeAfter.shippingRateId, 'shr_paid_495');

const missingPaid = resolvePaperbackShippingRateId(
  { ...ENV, STRIPE_PAPERBACK_SHIPPING_RATE_ID: 'not-a-rate' },
  AFTER,
);
assert.strictEqual(missingPaid.ok, false);
assert.strictEqual(missingPaid.status, 500);

assert.strictEqual(isPaperbackPriceId(ENV, 'price_legacy_2600'), true);
assert.strictEqual(isPaperbackPriceId(ENV, 'price_sale_2195'), true);
assert.strictEqual(isPaperbackPriceId(ENV, 'price_ebook'), false);
assert.strictEqual(isPaperbackPriceId(ENV, null), false);

const createCheckout = require('fs').readFileSync(
  require('path').join(__dirname, '../api/create-checkout-session.cjs'),
  'utf8',
);
assert.match(createCheckout, /resolvePaperbackPriceId/);
assert.match(createCheckout, /resolvePaperbackShippingRateId/);
assert.match(createCheckout, /STRIPE_ASSOCIATE_15_COUPON_ID/);
assert.match(createCheckout, /stripStaleCheckoutIdentityFromMetadata/);
assert.doesNotMatch(createCheckout, /COMMISSION_CENTS/);

const webhook = require('fs').readFileSync(
  require('path').join(__dirname, '../api/stripe-webhook.cjs'),
  'utf8',
);
assert.match(webhook, /const COMMISSION_CENTS = 200/);

console.log('verify-paperback-offer: ok');
