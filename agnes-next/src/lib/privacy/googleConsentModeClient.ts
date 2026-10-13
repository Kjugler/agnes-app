import { googleConsentModeState } from './googleConsentMode';

function getWindow(): Window | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as { window?: Window }).window;
}

/** Local command queue only. Does not load gtm.js or gtag.js. */
export function ensureGtagCommandQueue(): void {
  const win = getWindow();
  if (!win) return;
  win.dataLayer = win.dataLayer || [];
  if (typeof win.gtag !== 'function') {
    win.gtag = function gtag() {
      win.dataLayer?.push(arguments as unknown as never);
    };
  }
}

export function applyGoogleConsentDefault(allowed: boolean): void {
  const win = getWindow();
  if (!win) return;
  ensureGtagCommandQueue();
  win.gtag?.('consent', 'default', googleConsentModeState(allowed));
}

export function applyGoogleConsentUpdate(allowed: boolean): void {
  const win = getWindow();
  if (!win) return;
  ensureGtagCommandQueue();
  win.gtag?.('consent', 'update', googleConsentModeState(allowed));
}
