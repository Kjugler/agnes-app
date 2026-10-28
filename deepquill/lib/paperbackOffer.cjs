/**
 * Date-gated paperback price and shipping. America/Denver civil dates.
 * Midnight is the start of that Denver day. Inject `now` only in tests.
 * Does not read process.env itself — callers pass envConfig.
 *
 * Oct 2–16: $21.95 and free shipping.
 * Oct 17–31: $21.95 and $4.95 shipping.
 * Nov 1–26: $26.00 and $4.95 shipping.
 * Nov 27–30: $21.95 and free shipping. Ends Dec 1 at 12:00 a.m.
 * Dec 1 onward: $26.00 and $4.95 shipping.
 */

const { formatDenverYmd } = require('./denverTime.cjs');

const PAPERBACK_SALE_START_YMD = '2026-10-02';
const PAPERBACK_FREE_SHIPPING_END_YMD = '2026-10-16';
const PAPERBACK_LIST_RESUME_YMD = '2026-11-01';
const PAPERBACK_HOLIDAY_START_YMD = '2026-11-27';
const PAPERBACK_HOLIDAY_END_YMD = '2026-12-01';
const PAPERBACK_LIST_PRICE_CENTS = 2600;
const PAPERBACK_SALE_PRICE_CENTS = 2195;
const PAPERBACK_PAID_SHIPPING_CENTS = 495;
const PAPERBACK_FREE_SHIPPING_CENTS = 0;

function inRange(ymd, start, endExclusive) {
  return ymd >= start && ymd < endExclusive;
}

function isPaperbackHolidayWindow(now = new Date()) {
  return inRange(formatDenverYmd(now), PAPERBACK_HOLIDAY_START_YMD, PAPERBACK_HOLIDAY_END_YMD);
}

function isPaperbackSalePriceActive(now = new Date()) {
  const ymd = formatDenverYmd(now);
  const october = inRange(ymd, PAPERBACK_SALE_START_YMD, PAPERBACK_LIST_RESUME_YMD);
  return october || isPaperbackHolidayWindow(now);
}

function isPaperbackFreeShippingWindow(now = new Date()) {
  const ymd = formatDenverYmd(now);
  const octoberFree = ymd >= PAPERBACK_SALE_START_YMD && ymd <= PAPERBACK_FREE_SHIPPING_END_YMD;
  return octoberFree || isPaperbackHolidayWindow(now);
}

function getPaperbackCatalogPhase(now = new Date()) {
  if (isPaperbackHolidayWindow(now)) return 'holiday';
  if (isPaperbackFreeShippingWindow(now)) return 'free_shipping';
  if (isPaperbackSalePriceActive(now)) return 'sale_paid_shipping';
  return 'pre_sale';
}

function paperbackMerchandiseCents(now = new Date()) {
  return isPaperbackSalePriceActive(now) ? PAPERBACK_SALE_PRICE_CENTS : PAPERBACK_LIST_PRICE_CENTS;
}

function paperbackShippingCents(now = new Date()) {
  return isPaperbackFreeShippingWindow(now) ? PAPERBACK_FREE_SHIPPING_CENTS : PAPERBACK_PAID_SHIPPING_CENTS;
}

function paperbackReferralSavingsCents(now = new Date()) {
  return Math.round((paperbackMerchandiseCents(now) * 15) / 100);
}

function paperbackReferralTotalDueCents(now = new Date()) {
  const price = paperbackMerchandiseCents(now);
  return price - paperbackReferralSavingsCents(now) + paperbackShippingCents(now);
}

function formatUsdFromCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function isPriceId(value) {
  return typeof value === 'string' && value.startsWith('price_');
}

function isShippingRateId(value) {
  return typeof value === 'string' && value.startsWith('shr_');
}

/**
 * @param {{ STRIPE_PRICE_PAPERBACK?: string|null, STRIPE_PRICE_PAPERBACK_2195?: string|null }} env
 * @param {Date} [now]
 */
function resolvePaperbackPriceId(env, now = new Date()) {
  if (!isPaperbackSalePriceActive(now)) {
    const priceId = env && env.STRIPE_PRICE_PAPERBACK;
    if (!isPriceId(priceId)) {
      return {
        ok: false,
        status: 500,
        error: 'Paperback price is not configured',
        detail: 'Set STRIPE_PRICE_PAPERBACK to a Stripe Price ID (price_...)',
      };
    }
    return { ok: true, priceId, phase: getPaperbackCatalogPhase(now) };
  }

  const priceId = env && env.STRIPE_PRICE_PAPERBACK_2195;
  if (!isPriceId(priceId)) {
    return {
      ok: false,
      status: 500,
      error: 'Paperback sale price is not configured',
      detail: 'Set STRIPE_PRICE_PAPERBACK_2195 to a Stripe Price ID (price_...) for $21.95',
    };
  }
  return { ok: true, priceId, phase: getPaperbackCatalogPhase(now) };
}

/**
 * @param {{ STRIPE_PAPERBACK_SHIPPING_RATE_ID?: string|null, STRIPE_PAPERBACK_FREE_SHIPPING_RATE_ID?: string|null }} env
 * @param {Date} [now]
 */
function resolvePaperbackShippingRateId(env, now = new Date()) {
  const phase = getPaperbackCatalogPhase(now);

  if (isPaperbackFreeShippingWindow(now)) {
    const shippingRateId = env && env.STRIPE_PAPERBACK_FREE_SHIPPING_RATE_ID;
    if (!isShippingRateId(shippingRateId)) {
      return {
        ok: false,
        status: 500,
        error: 'Paperback free shipping is not configured',
        detail:
          'Set STRIPE_PAPERBACK_FREE_SHIPPING_RATE_ID to a Stripe Shipping Rate ID (shr_...) for $0',
      };
    }
    return { ok: true, shippingRateId, phase };
  }

  const shippingRateId = env && env.STRIPE_PAPERBACK_SHIPPING_RATE_ID;
  if (!isShippingRateId(shippingRateId)) {
    return {
      ok: false,
      status: 500,
      error: 'Paperback shipping is not configured',
      detail: 'Set STRIPE_PAPERBACK_SHIPPING_RATE_ID to a Stripe Shipping Rate ID (shr_...)',
    };
  }
  return { ok: true, shippingRateId, phase };
}

/**
 * Both the $26 and $21.95 Price IDs are paperback.
 * @param {{ STRIPE_PRICE_PAPERBACK?: string|null, STRIPE_PRICE_PAPERBACK_2195?: string|null }} env
 * @param {string|null|undefined} priceId
 */
function isPaperbackPriceId(env, priceId) {
  if (!priceId || typeof priceId !== 'string') return false;
  const current = env && env.STRIPE_PRICE_PAPERBACK;
  const sale = env && env.STRIPE_PRICE_PAPERBACK_2195;
  return priceId === current || priceId === sale;
}

module.exports = {
  PAPERBACK_SALE_START_YMD,
  PAPERBACK_FREE_SHIPPING_END_YMD,
  PAPERBACK_LIST_RESUME_YMD,
  PAPERBACK_HOLIDAY_START_YMD,
  PAPERBACK_HOLIDAY_END_YMD,
  PAPERBACK_LIST_PRICE_CENTS,
  PAPERBACK_SALE_PRICE_CENTS,
  isPaperbackHolidayWindow,
  isPaperbackSalePriceActive,
  isPaperbackFreeShippingWindow,
  getPaperbackCatalogPhase,
  paperbackMerchandiseCents,
  paperbackShippingCents,
  paperbackReferralSavingsCents,
  paperbackReferralTotalDueCents,
  formatUsdFromCents,
  resolvePaperbackPriceId,
  resolvePaperbackShippingRateId,
  isPaperbackPriceId,
};
