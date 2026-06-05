export type MetaStandardEvent =
  | 'PageView'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'Purchase';

export type MetaEventProps = Record<string, string | number | string[] | undefined>;

export type MetaPixelDebugEntry = {
  event: string;
  props?: Record<string, unknown>;
  at: string;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    __metaPixelDebugEvents?: MetaPixelDebugEntry[];
  }
}

export function getMetaPixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  return id || null;
}

export function isMetaPixelEnabled(): boolean {
  return Boolean(getMetaPixelId());
}

/** True when ?pixel_debug=1 or NEXT_PUBLIC_META_PIXEL_DEBUG=true */
export function isMetaPixelDebugMode(): boolean {
  if (process.env.NEXT_PUBLIC_META_PIXEL_DEBUG === 'true') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pixel_debug') === '1';
}

/** Record an event in the debug panel / console without calling fbq. */
export function recordMetaPixelDebug(
  event: string,
  props?: Record<string, unknown>,
): void {
  recordMetaPixelDebugInternal(event, props);
}

function recordMetaPixelDebugInternal(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  const entry: MetaPixelDebugEntry = {
    event,
    props,
    at: new Date().toISOString(),
  };

  window.__metaPixelDebugEvents = window.__metaPixelDebugEvents || [];
  window.__metaPixelDebugEvents.unshift(entry);
  window.__metaPixelDebugEvents = window.__metaPixelDebugEvents.slice(0, 20);
  window.dispatchEvent(new CustomEvent('meta-pixel-event', { detail: entry }));

  if (isMetaPixelDebugMode()) {
    console.info('[meta-pixel]', event, props ?? {});
  }
}

export function pageMeta(): void {
  if (typeof window === 'undefined' || !isMetaPixelEnabled()) return;
  try {
    window.fbq?.('track', 'PageView');
    recordMetaPixelDebugInternal('PageView');
  } catch {
    /* swallow */
  }
}

export function trackMeta(
  event: MetaStandardEvent,
  props?: MetaEventProps,
  options?: { eventID?: string },
): void {
  if (typeof window === 'undefined' || !isMetaPixelEnabled()) return;
  if (event === 'PageView') {
    pageMeta();
    return;
  }

  try {
    const payload = props
      ? Object.fromEntries(
          Object.entries(props).filter(([, v]) => v !== undefined && v !== null),
        )
      : undefined;

    if (options?.eventID) {
      window.fbq?.('track', event, payload, { eventID: options.eventID });
    } else {
      window.fbq?.('track', event, payload);
    }

    recordMetaPixelDebugInternal(event, payload as Record<string, unknown> | undefined);
  } catch {
    /* swallow */
  }
}
