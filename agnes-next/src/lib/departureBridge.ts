/** Rules for the optional departure invitation. No network and no mail. */

export const DEPARTURE_MEMORY_KEY = 'ap_departure_bridge_v1';
export const DEPARTURE_SESSION_KEY = 'ap_departure_bridge_session_v1';
export const JODY_ACCESS_SETTLED_KEY = 'ap_jody_access_settled_v1';
export const MOBILE_INVITE_SEEN_KEY = 'ap_mobile_promo_invite_v1';
export const SAMPLE_READING_ENGAGED_KEY = 'ap_sample_reading_engaged_v1';
export const ENGAGEMENT_MS = 15_000;
export const TOP_EXIT_PX = 8;

export type DepartureMemory = 'dismissed' | 'accepted' | null;

export function readDepartureMemory(value: string | null | undefined): DepartureMemory {
  if (value === 'dismissed' || value === 'accepted') return value;
  return null;
}

/** A stored refusal or acceptance outranks a dismissal from only this visit. */
export function readStoredDepartureMemory(
  persistent: string | null | undefined,
  session: string | null | undefined,
): DepartureMemory {
  return readDepartureMemory(persistent) || readDepartureMemory(session);
}

export function markJodyAccessSettled(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(JODY_ACCESS_SETTLED_KEY, '1');
}

export function markSampleReadingEngaged(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SAMPLE_READING_ENGAGED_KEY, '1');
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
  audienceChecked: boolean;
  subsequentToJody: boolean;
  readingEngaged: boolean;
  mobileInviteSeen: boolean;
}): { offer: boolean; reason: string; presentation: 'none' | 'overlay' | 'inline' } {
  const quiet = (reason: string) => ({ offer: false as const, reason, presentation: 'none' as const });
  if (isProtectedDeparturePath(input.pathname) || !isDeparturePage(input.pathname)) {
    return quiet('excluded_path');
  }
  if (!input.audienceChecked) return quiet('audience_pending');
  if (input.memory) return quiet('already_seen');
  if (input.decided) return quiet('already_decided');
  if (input.jodyActive) return quiet('jody_active');
  if (!input.subsequentToJody) return quiet('awaiting_subsequent');
  if (input.desktop) {
    if (!hasMeaningfulEngagement(input)) return quiet('not_engaged');
    if (!input.exitIntent) return quiet('not_exit');
    return { offer: true, reason: 'exit_intent', presentation: 'overlay' };
  }
  if (input.pathname !== '/sample-chapters') return quiet('mobile_footer_fallback');
  if (input.mobileInviteSeen) return quiet('already_offered');
  if (!hasMeaningfulEngagement(input) && !input.readingEngaged) return quiet('mobile_footer_fallback');
  return { offer: true, reason: 'mobile_invitation', presentation: 'inline' };
}
