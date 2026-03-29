import { NextRequest } from 'next/server';

export type EntryVariant = 'terminal' | 'protocol' | 'contest' | null;

export type EntryFunnelPhase = 1 | 2 | 3;

export type EntryFunnelDecision =
  | 'query_override'
  | 'query_override_blocked_terminal_discovery'
  | 'weighted_first_visit'
  | 'unseen_preference'
  | 'sticky_settled'
  | 'sticky_discovery_replace_terminal'
  /** entry_variant existed before seen_* cookies (deploy migration) */
  | 'sticky_legacy_no_seen_state';

const SEEN_MAX_AGE = 60 * 60 * 24 * 365; // 1 year — experience memory
const STICKY_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — settled visitor sticky variant

function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m?.[1]?.trim() ?? null;
}

function parseSeenFlags(): { terminal: boolean; protocol: boolean; contest: boolean } {
  return {
    terminal: readBrowserCookie('seen_terminal') === '1',
    protocol: readBrowserCookie('seen_protocol') === '1',
    contest: readBrowserCookie('seen_contest') === '1',
  };
}

function hasTerminalDiscoveryComplete(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('terminal_discovery_complete=1'));
}

/**
 * Mark that the visitor has been routed to this entry method at least once.
 * Long-lived; drives Phase 2 (prefer unseen) and Phase 3 (all seen → sticky).
 */
export function setSeenVariantCookie(variant: 'terminal' | 'protocol' | 'contest'): void {
  if (typeof document === 'undefined') return;
  const name =
    variant === 'terminal' ? 'seen_terminal' : variant === 'protocol' ? 'seen_protocol' : 'seen_contest';
  document.cookie = `${name}=1; path=/; max-age=${SEEN_MAX_AGE}; SameSite=Lax`;
}

/**
 * Get the entry variant from request cookies or query params (server-side)
 * Returns null if no variant is found
 */
export function getEntryVariant(req: NextRequest): EntryVariant {
  const queryVariant = req.nextUrl.searchParams.get('v');
  if (queryVariant === 'terminal' || queryVariant === 'protocol' || queryVariant === 'contest') {
    return queryVariant;
  }

  const cookieVariant = req.cookies.get('entry_variant')?.value;
  if (cookieVariant === 'terminal' || cookieVariant === 'protocol' || cookieVariant === 'contest') {
    return cookieVariant;
  }

  return null;
}

export type EntryFunnelResolution = {
  variant: 'terminal' | 'protocol' | 'contest';
  phase: EntryFunnelPhase;
  decision: EntryFunnelDecision;
};

/**
 * Weighted random (defaults 20 / 40 / 40 if env missing). Honors NEXT_PUBLIC_ENTRY_SPLIT_* at build time.
 */
function assignWeightedVariant(allowTerminal: boolean): 'terminal' | 'protocol' | 'contest' {
  if (!allowTerminal) {
    return assignWeightedVariantNoTerminal();
  }
  const terminal = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_TERMINAL || '20', 10) || 20;
  const protocol = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL || '40', 10) || 40;
  const contest = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_CONTEST || '40', 10) || 40;

  const total = terminal + protocol + contest;
  const r = Math.random() * (total || 100);

  if (r < terminal) return 'terminal';
  if (r < terminal + protocol) return 'protocol';
  return 'contest';
}

/**
 * Weighted random protocol vs contest only (e.g. terminal excluded by discovery).
 */
function assignWeightedVariantNoTerminal(): 'protocol' | 'contest' {
  const protocol = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL || '40', 10) || 40;
  const contest = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_CONTEST || '40', 10) || 40;
  const total = protocol + contest;
  const r = Math.random() * (total || 100);
  return r < protocol ? 'protocol' : 'contest';
}

function pickUniformUnseen(
  candidates: Array<'terminal' | 'protocol' | 'contest'>
): 'terminal' | 'protocol' | 'contest' {
  if (candidates.length === 0) return assignWeightedVariantNoTerminal();
  const i = Math.floor(Math.random() * candidates.length);
  return candidates[i];
}

/**
 * Full entry funnel resolution (client-only). Zero network I/O.
 *
 * Precedence:
 * 1. ?v=terminal|protocol|contest — unless terminal + terminal_discovery_complete (terminal blocked)
 * 2. Phase 3 (all seen_*): sticky entry_variant for 7 days (same as legacy), with discovery terminal guard
 * 3. Phase 1 (no seen_*): weighted 20/40/40 (defaults)
 * 4. Phase 2 (some but not all seen_*): uniform pick among unseen (terminal only if allowed)
 */
export function resolveEntryFunnelClient(): EntryFunnelResolution {
  if (typeof window === 'undefined') {
    return { variant: 'contest', phase: 1, decision: 'weighted_first_visit' };
  }

  const params = new URLSearchParams(window.location.search);
  const queryV = params.get('v');
  const discovery = hasTerminalDiscoveryComplete();
  const allowTerminal = !discovery;

  const seen = parseSeenFlags();
  const anySeen = seen.terminal || seen.protocol || seen.contest;
  const allSeen = seen.terminal && seen.protocol && seen.contest;

  const stickyMatch = document.cookie.match(/(?:^|;\s*)entry_variant=([^;]+)/);
  const stickyV = stickyMatch?.[1]?.trim();
  const stickyValid =
    stickyV === 'terminal' || stickyV === 'protocol' || stickyV === 'contest' ? stickyV : null;

  // 1) Query override
  if (queryV === 'terminal' || queryV === 'protocol' || queryV === 'contest') {
    if (queryV === 'terminal' && !allowTerminal) {
      return {
        variant: assignWeightedVariantNoTerminal(),
        phase: allSeen ? 3 : anySeen ? 2 : 1,
        decision: 'query_override_blocked_terminal_discovery',
      };
    }
    return {
      variant: queryV,
      phase: allSeen ? 3 : anySeen ? 2 : 1,
      decision: 'query_override',
    };
  }

  // 1b) Legacy sticky before any seen_* cookie (post-deploy first visit)
  if (!anySeen && stickyValid) {
    if (stickyValid === 'terminal' && !allowTerminal) {
      return {
        variant: assignWeightedVariantNoTerminal(),
        phase: 3,
        decision: 'sticky_discovery_replace_terminal',
      };
    }
    return { variant: stickyValid, phase: 3, decision: 'sticky_legacy_no_seen_state' };
  }

  // 2) Phase 3 — sticky (legacy entry_variant), 7-day cookie
  if (allSeen) {
    if (stickyValid) {
      if (stickyValid === 'terminal' && !allowTerminal) {
        return {
          variant: assignWeightedVariantNoTerminal(),
          phase: 3,
          decision: 'sticky_discovery_replace_terminal',
        };
      }
      return { variant: stickyValid, phase: 3, decision: 'sticky_settled' };
    }
    const v = assignWeightedVariant(allowTerminal);
    return { variant: v, phase: 3, decision: 'sticky_settled' };
  }

  // 3) Phase 1 — first visit (no experience cookies yet)
  if (!anySeen) {
    const v = assignWeightedVariant(allowTerminal);
    return { variant: v, phase: 1, decision: 'weighted_first_visit' };
  }

  // 4) Phase 2 — prefer unseen
  const unseen: Array<'terminal' | 'protocol' | 'contest'> = [];
  if (!seen.terminal && allowTerminal) unseen.push('terminal');
  if (!seen.protocol) unseen.push('protocol');
  if (!seen.contest) unseen.push('contest');

  const v = pickUniformUnseen(unseen);
  return { variant: v, phase: 2, decision: 'unseen_preference' };
}

/**
 * Client-side: returns chosen variant only (backward compatible).
 */
export function resolveVariantClient(): 'terminal' | 'protocol' | 'contest' {
  return resolveEntryFunnelClient().variant;
}

/**
 * Set entry_variant cookie (client-side) for sticky behavior in Phase 3 (7 days).
 */
export function setVariantCookieClient(variant: 'terminal' | 'protocol' | 'contest'): void {
  if (typeof document === 'undefined') return;
  document.cookie = `entry_variant=${variant}; path=/; max-age=${STICKY_MAX_AGE}; SameSite=Lax`;
  document.cookie = `dq_entry_variant=${variant}; path=/; max-age=${STICKY_MAX_AGE}; SameSite=Lax`;
}

export function logEntryVariant(action: string, variant: EntryVariant, metadata?: Record<string, unknown>) {
  if (variant) {
    console.log(`[ENTRY_VARIANT] ${action}`, {
      variant,
      ...metadata,
    });
  }
}
