import { mayUseAdvertisingMeasurement } from '@/lib/privacy/advertisingConsentClient';

/** Flat paperback shipping (cents) — matches Stripe checkout shipping rate. */
export const PAPERBACK_SHIPPING_CENTS = 495;

export type TikTokEventName =
  | 'ViewContent'
  | 'Browse'
  | 'InitiateCheckout'
  | 'CompletePayment';

export type TikTokEventProps = Record<string, string | number | undefined>;

declare global {
  interface Window {
    ttq?: {
      page: () => void;
      identify: (props: Record<string, string>) => void;
      track: (
        event: string,
        props?: Record<string, unknown>,
        options?: { event_id?: string },
      ) => void;
      load: (pixelId: string) => void;
    };
  }
}

const PURCHASE_GUARD_PREFIX = 'agnes.tiktok.purchase.';

/** Trim and lowercase. TikTok rejects any other email rewriting before hashing. */
export function normalizePurchaseEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}

/** Accept an already international number. Do not invent a country code. */
export function normalizePurchasePhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const phone = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

export function normalizePurchaseExternalId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > 128) return null;
  return id;
}

export async function sha256Hex(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function purchaseAlreadyReported(eventId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${PURCHASE_GUARD_PREFIX}${eventId}`) === '1';
  } catch {
    return false;
  }
}

function markPurchaseReported(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${PURCHASE_GUARD_PREFIX}${eventId}`, '1');
  } catch {
    /* The in-page call still sends once. A later load may send again. */
  }
}

export function getTikTokPixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
  return id || null;
}

/** Pixel loads when ID is set (production or dev with env configured). */
export function isTikTokEnabled(): boolean {
  return Boolean(getTikTokPixelId());
}

export function pageTikTok(): void {
  if (typeof window === 'undefined' || !isTikTokEnabled()) return;
  if (!mayUseAdvertisingMeasurement()) return;
  try {
    window.ttq?.page();
  } catch {
    /* swallow */
  }
}

export function trackTikTok(event: TikTokEventName, props?: TikTokEventProps): void {
  if (typeof window === 'undefined' || !isTikTokEnabled()) return;
  if (!mayUseAdvertisingMeasurement()) return;
  try {
    const payload = props
      ? Object.fromEntries(
          Object.entries(props).filter(([, v]) => v !== undefined && v !== null),
        )
      : undefined;
    window.ttq?.track(event, payload);
  } catch {
    /* swallow */
  }
}

/**
 * Browser Purchase signal for one paid Stripe session.
 * Identifiers are hashed and sent only when advertising measurement is already allowed.
 * A reading-access email is never an input. Subscription consent is not written.
 */
export async function trackVerifiedTikTokPurchase(input: {
  paid: boolean;
  eventId: string;
  contentId: string;
  value: number;
  currency: string;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
}): Promise<void> {
  if (input.paid !== true) return;
  if (typeof window === 'undefined' || !isTikTokEnabled()) return;
  if (!mayUseAdvertisingMeasurement()) return;

  const eventId = input.eventId.trim();
  if (!eventId || !window.ttq?.track || purchaseAlreadyReported(eventId)) return;
  markPurchaseReported(eventId);

  try {
    const identify: Record<string, string> = {};
    const email = normalizePurchaseEmail(input.email);
    const phone = normalizePurchasePhone(input.phone);
    const externalId = normalizePurchaseExternalId(input.externalId);
    if (email) {
      const hashed = await sha256Hex(email);
      if (hashed) identify.email = hashed;
    }
    if (phone) {
      const hashed = await sha256Hex(phone);
      if (hashed) identify.phone_number = hashed;
    }
    if (externalId) {
      const hashed = await sha256Hex(externalId);
      if (hashed) identify.external_id = hashed;
    }
    if (Object.keys(identify).length > 0) window.ttq?.identify(identify);

    window.ttq?.track(
      'CompletePayment',
      {
        content_id: input.contentId,
        content_type: 'product',
        quantity: 1,
        value: input.value,
        currency: input.currency,
      },
      { event_id: eventId },
    );
  } catch {
    /* swallow */
  }
}
