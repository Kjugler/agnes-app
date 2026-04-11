import { NextRequest } from 'next/server';

export type EntryVariant = 'terminal' | 'protocol' | 'contest' | null;

export type EntryFunnelPhase = 1 | 2 | 3;

export type EntryFunnelDecision =
  | 'query_override'
  | 'query_override_blocked_terminal_discovery'
  | 'weighted_first_visit'
  /** Phase 2: renormalized NEXT_PUBLIC_ENTRY_SPLIT_* over unseen eligible variants only */
  | 'weighted_unseen'
  | 'sticky_settled'
  | 'sticky_discovery_replace_terminal'
  /** Sticky cookie was terminal — IBM removed from public funnel, reroll protocol/contest */
  | 'sticky_terminal_removed_public_funnel';

const SEEN_MAX_AGE = 60 * 60 * 24 * 365; // 1 year — experience memory
const STICKY_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — settled visitor sticky variant

/** Incremented only from Lightening `handleContinue` (Continue or video end). Not used by /terminal. */
const LS_LIGHTNING_CONTINUE_COUNT = 'dq_lightning_continue_count';

export function getLightningContinueCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(LS_LIGHTNING_CONTINUE_COUNT);
  const n = parseInt(raw ?? '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Call once per lightning bridge completion, before `resolveEntryFunnelClient()`. */
export function incrementLightningContinueCount(): number {
  if (typeof window === 'undefined') return 0;
  const next = getLightningContinueCount() + 1;
  try {
    localStorage.setItem(LS_LIGHTNING_CONTINUE_COUNT, String(next));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

/** Terminal in weighted funnel only after 4+ lightning completions and if discovery has not locked it out. */
function canOfferTerminalInWeightedFunnel(): boolean {
  if (typeof window === 'undefined') return false;
  return getLightningContinueCount() >= 4 && !hasTerminalDiscoveryComplete();
}

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

/** Configured split weights (terminal 0 when not eligible). Defaults 20/40/40. */
function getRawWeights(allowTerminal: boolean): {
  terminal: number;
  protocol: number;
  contest: number;
} {
  const terminal = allowTerminal
    ? parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_TERMINAL || '20', 10) || 20
    : 0;
  const protocol = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL || '40', 10) || 40;
  const contest = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_CONTEST || '40', 10) || 40;
  return { terminal, protocol, contest };
}

/**
 * Weighted random (defaults 20 / 40 / 40 if env missing). Honors NEXT_PUBLIC_ENTRY_SPLIT_* at build time.
 */
function assignWeightedVariant(allowTerminal: boolean): 'terminal' | 'protocol' | 'contest' {
  if (!allowTerminal) {
    return assignWeightedVariantNoTerminal();
  }
  const { terminal, protocol, contest } = getRawWeights(true);
  const total = terminal + protocol + contest;
  const r = Math.random() * (total || 100);

  if (r < terminal) return 'terminal';
  if (r < terminal + protocol) return 'protocol';
  return 'contest';
}

/**
 * Weighted random protocol vs contest only (IBM terminal never assigned by public funnel).
 */
export function assignWeightedVariantNoTerminal(): 'protocol' | 'contest' {
  const protocol = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL || '40', 10) || 40;
  const contest = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_CONTEST || '40', 10) || 40;
  const total = protocol + contest;
  const r = Math.random() * (total || 100);
  return r < protocol ? 'protocol' : 'contest';
}

/**
 * Phase 2: pick among unseen paths using renormalized configured weights (not uniform).
 * Example: unseen {terminal, protocol} with 20/40/40 → P(terminal)=20/60, P(protocol)=40/60.
 */
function pickWeightedUnseen(
  unseen: Array<'terminal' | 'protocol' | 'contest'>,
  allowTerminal: boolean
): 'terminal' | 'protocol' | 'contest' {
  if (unseen.length === 0) return assignWeightedVariantNoTerminal();

  const w = getRawWeights(allowTerminal);
  type V = 'terminal' | 'protocol' | 'contest';
  const weightFor = (v: V): number =>
    v === 'terminal' ? w.terminal : v === 'protocol' ? w.protocol : w.contest;

  let total = 0;
  const weighted: Array<{ variant: V; weight: number }> = [];
  for (const v of unseen) {
    const weight = weightFor(v);
    total += weight;
    weighted.push({ variant: v, weight });
  }

  if (total <= 0) {
    return unseen[Math.floor(Math.random() * unseen.length)];
  }

  let r = Math.random() * total;
  for (const entry of weighted) {
    r -= entry.weight;
    if (r <= 0) return entry.variant;
  }
  return weighted[weighted.length - 1].variant;
}

/**
 * Full entry funnel resolution (client-only). Zero network I/O.
 *
 * IBM terminal in weighted splits: only after `incrementLightningContinueCount()` has run and
 * `getLightningContinueCount() >= 4`, and not when `terminal_discovery_complete` is set.
 * Explicit `?v=terminal` still works when discovery allows. Direct `/terminal` does not use this.
 *
 * Precedence:
 * 1. ?v=terminal|protocol|contest — terminal blocked if terminal_discovery_complete
 * 2. Phase 3 (all seen_*): sticky entry_variant (terminal sticky honored only if weighted terminal allowed)
 * 3. Phase 1: weighted split including terminal when allowed
 * 4. Phase 2: unseen paths, terminal when allowed
 */
export function resolveEntryFunnelClient(): EntryFunnelResolution {
  if (typeof window === 'undefined') {
    return { variant: 'contest', phase: 1, decision: 'weighted_first_visit' };
  }

  const params = new URLSearchParams(window.location.search);
  const queryV = params.get('v');
  const discovery = hasTerminalDiscoveryComplete();
  const allowQueryTerminal = !discovery;
  const allowTerminalWeighted = canOfferTerminalInWeightedFunnel();

  const seen = parseSeenFlags();
  const anySeen = seen.terminal || seen.protocol || seen.contest;
  const allSeen = seen.terminal && seen.protocol && seen.contest;

  const stickyMatch = document.cookie.match(/(?:^|;\s*)entry_variant=([^;]+)/);
  const stickyV = stickyMatch?.[1]?.trim();
  const stickyValid =
    stickyV === 'terminal' || stickyV === 'protocol' || stickyV === 'contest' ? stickyV : null;

  // 1) Query override
  if (queryV === 'terminal' || queryV === 'protocol' || queryV === 'contest') {
    if (queryV === 'terminal' && !allowQueryTerminal) {
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

  // 2) Phase 3 — sticky (legacy entry_variant), 7-day cookie
  if (allSeen) {
    if (stickyValid) {
      if (stickyValid === 'terminal') {
        if (!allowTerminalWeighted) {
          return {
            variant: assignWeightedVariantNoTerminal(),
            phase: 3,
            decision: discovery ? 'sticky_discovery_replace_terminal' : 'sticky_terminal_removed_public_funnel',
          };
        }
        return { variant: 'terminal', phase: 3, decision: 'sticky_settled' };
      }
      return { variant: stickyValid, phase: 3, decision: 'sticky_settled' };
    }
    const v = assignWeightedVariant(allowTerminalWeighted);
    return { variant: v, phase: 3, decision: 'sticky_settled' };
  }

  // 3) Phase 1 — first visit (no experience cookies yet)
  if (!anySeen) {
    const v = assignWeightedVariant(allowTerminalWeighted);
    return { variant: v, phase: 1, decision: 'weighted_first_visit' };
  }

  // 4) Phase 2 — prefer unseen
  const unseen: Array<'terminal' | 'protocol' | 'contest'> = [];
  if (!seen.terminal && allowTerminalWeighted) unseen.push('terminal');
  if (!seen.protocol) unseen.push('protocol');
  if (!seen.contest) unseen.push('contest');

  const v = pickWeightedUnseen(unseen, allowTerminalWeighted);
  return { variant: v, phase: 2, decision: 'weighted_unseen' };
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
