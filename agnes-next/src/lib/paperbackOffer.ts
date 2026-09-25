/**
 * Date-gated paperback price + shipping for the Oct 2026 experiment.
 * America/Denver civil dates. Inject `now` only in tests.
 */

export const DENVER_TZ = 'America/Denver';

/** First Denver day the $21.95 Price is charged. */
export const PAPERBACK_SALE_START_YMD = '2026-10-02';

/** Inclusive last Denver day of $0 shipping. */
export const PAPERBACK_FREE_SHIPPING_END_YMD = '2026-10-16';

export const PAPERBACK_LIST_PRICE_CENTS = 2600;
export const PAPERBACK_SALE_PRICE_CENTS = 2195;
export const PAPERBACK_PAID_SHIPPING_CENTS = 495;
export const PAPERBACK_FREE_SHIPPING_CENTS = 0;

export const PAPERBACK_PROMO_COPY = {
  was: 'WAS $26.00',
  now: 'NOW $21.95',
  freeShipping: 'FREE SHIPPING THROUGH OCTOBER 16',
  afterNote: 'After October 16, standard shipping returns.',
  title: 'THE AGNES PROTOCOL',
  author: 'Simon McQuade',
  standardShipping: '+ shipping at checkout',
} as const;

export type PaperbackCatalogPhase = 'pre_sale' | 'free_shipping' | 'sale_paid_shipping';

export function formatDenverYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isPaperbackSalePriceActive(now: Date = new Date()): boolean {
  return formatDenverYmd(now) >= PAPERBACK_SALE_START_YMD;
}

export function isPaperbackFreeShippingWindow(now: Date = new Date()): boolean {
  const ymd = formatDenverYmd(now);
  return ymd >= PAPERBACK_SALE_START_YMD && ymd <= PAPERBACK_FREE_SHIPPING_END_YMD;
}

export function getPaperbackCatalogPhase(now: Date = new Date()): PaperbackCatalogPhase {
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
