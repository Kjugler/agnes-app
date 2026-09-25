/**
 * Date-gated paperback price + shipping for the Oct 2026 experiment.
 * America/Denver civil dates. Inject `now` only in tests.
 * Does not read process.env itself — callers pass envConfig.
 */

const { formatDenverYmd } = require('./denverTime.cjs');

const PAPERBACK_SALE_START_YMD = '2026-10-02';
const PAPERBACK_FREE_SHIPPING_END_YMD = '2026-10-16';

function isPaperbackSalePriceActive(now = new Date()) {
  return formatDenverYmd(now) >= PAPERBACK_SALE_START_YMD;
}

function isPaperbackFreeShippingWindow(now = new Date()) {
  const ymd = formatDenverYmd(now);
  return ymd >= PAPERBACK_SALE_START_YMD && ymd <= PAPERBACK_FREE_SHIPPING_END_YMD;
}

function getPaperbackCatalogPhase(now = new Date()) {
  if (isPaperbackFreeShippingWindow(now)) return 'free_shipping';
  if (isPaperbackSalePriceActive(now)) return 'sale_paid_shipping';
  return 'pre_sale';
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
  isPaperbackSalePriceActive,
  isPaperbackFreeShippingWindow,
  getPaperbackCatalogPhase,
  resolvePaperbackPriceId,
  resolvePaperbackShippingRateId,
  isPaperbackPriceId,
};
