declare global {
  interface Window {
    uetq?: unknown[] | { push: (...args: unknown[]) => void };
    UET?: new (o: { ti: string; q?: unknown }) => { push: (event: string) => void };
  }
}

export function getMicrosoftUetTagId(): string | null {
  const id = process.env.NEXT_PUBLIC_MICROSOFT_UET_TAG_ID?.trim();
  return id || null;
}

/** UET loads when tag ID is set (production or dev with env configured). */
export function isMicrosoftUetEnabled(): boolean {
  return Boolean(getMicrosoftUetTagId());
}

function pushUetq(...args: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (!window.uetq) {
      window.uetq = [];
    }
    const q = window.uetq;
    if (typeof (q as { push?: (...a: unknown[]) => void }).push === 'function') {
      (q as { push: (...a: unknown[]) => void }).push(...args);
    }
  } catch {
    /* swallow */
  }
}

/** SPA route change page view (initial pageLoad is handled by MicrosoftUET base tag). */
export function pageMicrosoftUet(pagePath?: string): void {
  if (typeof window === 'undefined' || !isMicrosoftUetEnabled()) return;
  try {
    const payload = pagePath ? { page_path: pagePath } : {};
    pushUetq('event', 'page_view', payload);
  } catch {
    /* swallow */
  }
}
