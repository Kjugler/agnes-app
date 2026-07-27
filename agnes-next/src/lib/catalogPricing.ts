import { formatPrice } from '@/lib/products';

/** 15% reader discount — matches STRIPE_ASSOCIATE_15_COUPON_ID behavior. */
export const READER_DISCOUNT_PERCENT = 15;

export function readerDiscountCents(priceCents: number): number {
  return Math.round((priceCents * READER_DISCOUNT_PERCENT) / 100);
}

export function discountedPriceCents(priceCents: number): number {
  return priceCents - readerDiscountCents(priceCents);
}

export function formatDiscountedPrice(priceCents: number): string {
  return formatPrice(discountedPriceCents(priceCents));
}

export function formatSavings(priceCents: number): string {
  return `−${formatPrice(readerDiscountCents(priceCents))}`;
}
