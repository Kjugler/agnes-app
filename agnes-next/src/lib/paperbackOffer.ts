/**
 * Date-gated paperback price and shipping. America/Denver civil dates.
 * Midnight is the start of that Denver day. Inject `now` only in tests.
 *
 * Oct 2–16: $21.95 and free shipping.
 * Oct 17–31: $21.95 and $4.95 shipping.
 * Nov 1–26: $26.00 and $4.95 shipping.
 * Nov 27–30: $21.95 and free shipping. Ends Dec 1 at 12:00 a.m.
 * Dec 1 onward: $26.00 and $4.95 shipping.
 */

export const DENVER_TZ = 'America/Denver';

/** First Denver day the October $21.95 Price is charged. */
export const PAPERBACK_SALE_START_YMD = '2026-10-02';

/** Inclusive last Denver day of the October free-shipping window. */
export const PAPERBACK_FREE_SHIPPING_END_YMD = '2026-10-16';

/** First Denver day the $26 list price returns after the October sale. */
export const PAPERBACK_LIST_RESUME_YMD = '2026-11-01';

/** First Denver day of the Black Friday through Cyber Monday offer. */
export const PAPERBACK_HOLIDAY_START_YMD = '2026-11-27';

/** Denver midnight when the holiday offer ends and the $26 price returns. */
export const PAPERBACK_HOLIDAY_END_YMD = '2026-12-01';

export const PAPERBACK_LIST_PRICE_CENTS = 2600;
export const PAPERBACK_SALE_PRICE_CENTS = 2195;
export const PAPERBACK_PAID_SHIPPING_CENTS = 495;
export const PAPERBACK_FREE_SHIPPING_CENTS = 0;

export const PAPERBACK_HOLIDAY_OFFER =
  'Black Friday through Cyber Monday: paperback + free eBook, $21.95 with free shipping.';

export const PAPERBACK_PROMO_COPY = {
  was: 'WAS $26.00',
  now: 'NOW $21.95',
  freeShipping: 'FREE SHIPPING THROUGH OCTOBER 16',
  afterNote: 'After October 16, standard shipping returns.',
  holiday: PAPERBACK_HOLIDAY_OFFER,
  title: 'THE AGNES PROTOCOL',
  author: 'Simon McQuade',
  standardShipping: '+ shipping at checkout',
} as const;

export type PaperbackCatalogPhase = 'pre_sale' | 'free_shipping' | 'sale_paid_shipping' | 'holiday';

export function formatDenverYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function inRange(ymd: string, start: string, endExclusive: string): boolean {
  return ymd >= start && ymd < endExclusive;
}

export function isPaperbackHolidayWindow(now: Date = new Date()): boolean {
  return inRange(formatDenverYmd(now), PAPERBACK_HOLIDAY_START_YMD, PAPERBACK_HOLIDAY_END_YMD);
}

export function isPaperbackSalePriceActive(now: Date = new Date()): boolean {
  const ymd = formatDenverYmd(now);
  const october = inRange(ymd, PAPERBACK_SALE_START_YMD, PAPERBACK_LIST_RESUME_YMD);
  return october || isPaperbackHolidayWindow(now);
}

export function isPaperbackFreeShippingWindow(now: Date = new Date()): boolean {
  const ymd = formatDenverYmd(now);
  const octoberFree = ymd >= PAPERBACK_SALE_START_YMD && ymd <= PAPERBACK_FREE_SHIPPING_END_YMD;
  return octoberFree || isPaperbackHolidayWindow(now);
}

export function getPaperbackCatalogPhase(now: Date = new Date()): PaperbackCatalogPhase {
  if (isPaperbackHolidayWindow(now)) return 'holiday';
  if (isPaperbackFreeShippingWindow(now)) return 'free_shipping';
  if (isPaperbackSalePriceActive(now)) return 'sale_paid_shipping';
  return 'pre_sale';
}

export function getPaperbackOffer(now: Date = new Date()): {
  priceCents: number;
  displayPrice: string;
  shippingCents: number;
  phase: PaperbackCatalogPhase;
} {
  const phase = getPaperbackCatalogPhase(now);
  const priceCents = isPaperbackSalePriceActive(now)
    ? PAPERBACK_SALE_PRICE_CENTS
    : PAPERBACK_LIST_PRICE_CENTS;
  return {
    priceCents,
    displayPrice: `$${(priceCents / 100).toFixed(2)}`,
    shippingCents: paperbackShippingCents(now),
    phase,
  };
}

export function paperbackShippingCents(now: Date = new Date()): number {
  return isPaperbackFreeShippingWindow(now)
    ? PAPERBACK_FREE_SHIPPING_CENTS
    : PAPERBACK_PAID_SHIPPING_CENTS;
}

/** Browser Pixel / TikTok InitiateCheckout value (merchandise + shipping estimate). */
export function paperbackInitiateCheckoutValueCents(now: Date = new Date()): number {
  return getPaperbackOffer(now).priceCents + paperbackShippingCents(now);
}
