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
      track: (event: string, props?: Record<string, unknown>) => void;
      load: (pixelId: string) => void;
    };
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
  try {
    window.ttq?.page();
  } catch {
    /* swallow */
  }
}

export function trackTikTok(event: TikTokEventName, props?: TikTokEventProps): void {
  if (typeof window === 'undefined' || !isTikTokEnabled()) return;
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
