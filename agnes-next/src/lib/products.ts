// Product pricing configuration
// Prices are in USD cents (Stripe format)
// Display prices are formatted as strings

import { getPaperbackOffer } from '@/lib/paperbackOffer';

export type ProductId = 'paperback' | 'ebook' | 'audio_preorder';

export interface Product {
  id: ProductId;
  title: string;
  description: string;
  priceCents: number; // Stripe price in cents
  displayPrice: string; // Formatted for display
}

// Product pricing - single source of truth
// Paperback cents/display are pre-sale defaults; use getProduct() for the live offer.
export const PRODUCTS: Product[] = [
  {
    id: 'paperback',
    title: 'Paperback',
    description: 'Paperback includes FREE eBook',
    priceCents: 2600, // $26.00 pre-sale default
    displayPrice: '$26.00',
  },
  {
    id: 'ebook',
    title: 'eBook',
    description: 'Digital download',
    priceCents: 1200, // $12.00
    displayPrice: '$12.00',
  },
  {
    id: 'audio_preorder',
    title: 'Audio (Preorder)',
    description: 'Audio book preorder',
    priceCents: 1800, // $18.00
    displayPrice: '$18.00',
  },
];

// Helper to get product by ID (paperback price is date-gated)
export function getProduct(id: ProductId, now: Date = new Date()): Product | undefined {
  const base = PRODUCTS.find(p => p.id === id);
  if (!base) return undefined;
  if (id !== 'paperback') return base;
  const offer = getPaperbackOffer(now);
  return {
    ...base,
    priceCents: offer.priceCents,
    displayPrice: offer.displayPrice,
  };
}

// Helper to format price from cents
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

