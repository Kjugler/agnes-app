/** Rules for the optional departure invitation. No network and no mail. */

export const DEPARTURE_MEMORY_KEY = 'ap_departure_bridge_v1';
export const ENGAGEMENT_MS = 15_000;
export const TOP_EXIT_PX = 8;

export type DepartureMemory = 'dismissed' | 'accepted' | null;

export function readDepartureMemory(value: string | null | undefined): DepartureMemory {
  if (value === 'dismissed' || value === 'accepted') return value;
  return null;
}

export function isDeparturePage(pathname: string): boolean {
  return pathname === '/sample-chapters' || pathname === '/contest';
}

export function isProtectedDeparturePath(pathname: string): boolean {
  return (
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/sample-chapters/read') ||
    pathname.startsWith('/reader/jody') ||
    pathname.startsWith('/jody') ||
    pathname.startsWith('/readers-agree/go')
  );
}

export function hasMeaningfulEngagement(input: {
  elapsedMs: number;
  scrolled: boolean;
  interacted: boolean;
}): boolean {
  return input.elapsedMs >= ENGAGEMENT_MS && (input.scrolled || input.interacted);
}

export function isTopEdgeExit(input: { clientY: number; relatedTarget: unknown }): boolean {
  return input.clientY <= TOP_EXIT_PX && input.relatedTarget == null;
}

export function shouldOfferDeparture(input: {
  pathname: string;
  desktop: boolean;
  elapsedMs: number;
  scrolled: boolean;
  interacted: boolean;
  exitIntent: boolean;
  memory: DepartureMemory;
  decided: boolean;
  jodyActive: boolean;
}): { offer: boolean; reason: string } {
  if (isProtectedDeparturePath(input.pathname) || !isDeparturePage(input.pathname)) {
    return { offer: false, reason: 'excluded_path' };
  }
  if (!input.desktop) return { offer: false, reason: 'mobile_footer_fallback' };
  if (input.memory) return { offer: false, reason: 'already_seen' };
  if (input.decided) return { offer: false, reason: 'already_decided' };
  if (input.jodyActive) return { offer: false, reason: 'jody_active' };
  if (!hasMeaningfulEngagement(input)) return { offer: false, reason: 'not_engaged' };
  if (!input.exitIntent) return { offer: false, reason: 'not_exit' };
  return { offer: true, reason: 'exit_intent' };
}
