// Product pricing configuration
// Prices are in USD cents (Stripe format)
// Display prices are formatted as strings

export type ProductId = 'paperback' | 'ebook' | 'audio_preorder';

export interface Product {
  id: ProductId;
  title: string;
  description: string;
  priceCents: number; // Stripe price in cents
  displayPrice: string; // Formatted for display
}

// Product pricing - single source of truth
export const PRODUCTS: Product[] = [
  {
    id: 'paperback',
    title: 'Paperback',
    description: 'Paperback includes FREE eBook',
    priceCents: 2600, // $26.00
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

// Helper to get product by ID
export function getProduct(id: ProductId): Product | undefined {
  return PRODUCTS.find(p => p.id === id);
}

// Helper to format price from cents
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

