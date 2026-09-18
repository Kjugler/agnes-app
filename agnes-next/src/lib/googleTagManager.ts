/** Google Tag Manager container loader + post-purchase dataLayer event. Isolated from Google Ads gtag conversion. */

import { getProduct, type ProductId } from '@/lib/products';

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

export const GTM_PURCHASE_STORAGE_PREFIX = 'agnes.gtm.purchase.';

const pushedGtmPurchaseIds = new Set<string>();

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export function getGtmId(): string | null {
  const id = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  if (!id || !GTM_ID_PATTERN.test(id)) return null;
  return id;
}

export function isGtmEnabled(): boolean {
  return Boolean(getGtmId());
}

export function gtmPurchaseStorageKey(transactionId: string): string {
  return `${GTM_PURCHASE_STORAGE_PREFIX}${transactionId}`;
}

export type GtmPurchaseItem = {
  item_id: string;
  item_name: string;
  quantity: number;
};

export type GtmPurchaseEcommerce = {
  transaction_id: string;
  value: number;
  currency: string;
  items?: GtmPurchaseItem[];
};

export type GtmPurchaseInput = {
  transactionId: string;
  amountTotalCents?: number | null;
  currency?: string | null;
  productType?: string | null;
};

function getBrowserWindow(): Window | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as { window?: Window }).window;
}

function isKnownProductId(value: string | null | undefined): value is ProductId {
  return value === 'paperback' || value === 'ebook' || value === 'audio_preorder';
}

export function buildGtmPurchaseEcommerce(input: GtmPurchaseInput): GtmPurchaseEcommerce | null {
  const transactionId = String(input.transactionId || '').trim();
  if (!transactionId) return null;

  const amountTotalCents = Number(input.amountTotalCents);
  const value = Number.isFinite(amountTotalCents) ? amountTotalCents / 100 : 0;
  const currency = String(input.currency || 'usd').toUpperCase();

  const ecommerce: GtmPurchaseEcommerce = {
    transaction_id: transactionId,
    value,
    currency,
  };

  if (isKnownProductId(input.productType)) {
    const product = getProduct(input.productType);
    if (product) {
      ecommerce.items = [
        {
          item_id: product.id,
          item_name: product.title,
          quantity: 1,
        },
      ];
    }
  }

  return ecommerce;
}

/** Clears in-memory purchase dedup. Persistent localStorage keys are left intact. */
export function clearGtmPurchaseInMemoryDedup(): void {
  pushedGtmPurchaseIds.clear();
}

/**
 * Pushes one named GTM `purchase` event. Duplicate-safe per Stripe session ID.
 * Writes the localStorage guard before pushing. If localStorage is unavailable,
 * the first event still fires; in-memory dedup covers the same page lifetime.
 */
export function pushGtmPurchaseEvent(input: GtmPurchaseInput): boolean {
  const win = getBrowserWindow();
  if (!win) return false;

  const ecommerce = buildGtmPurchaseEcommerce(input);
  if (!ecommerce) return false;

  const transactionId = ecommerce.transaction_id;
  if (pushedGtmPurchaseIds.has(transactionId)) return false;

  const storageKey = gtmPurchaseStorageKey(transactionId);
  try {
    if (win.localStorage.getItem(storageKey)) return false;
  } catch {
    /* unavailable — do not suppress a legitimate first purchase */
  }

  try {
    win.localStorage.setItem(storageKey, '1');
  } catch {
    /* still emit the first purchase */
  }

  pushedGtmPurchaseIds.add(transactionId);

  try {
    win.dataLayer = win.dataLayer || [];
    win.dataLayer.push({ ecommerce: null });
    win.dataLayer.push({
      event: 'purchase',
      ecommerce,
    });
    return true;
  } catch {
    return false;
  }
}
