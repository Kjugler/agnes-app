import { NextRequest } from 'next/server';

export type EntryVariant = 'terminal' | 'protocol' | 'contest' | null;

/**
 * Get the entry variant from request cookies or query params (server-side)
 * Returns null if no variant is found
 */
export function getEntryVariant(req: NextRequest): EntryVariant {
  // Check query param first (for testing/override)
  const queryVariant = req.nextUrl.searchParams.get('v');
  if (queryVariant === 'terminal' || queryVariant === 'protocol' || queryVariant === 'contest') {
    return queryVariant;
  }

  // Check cookie
  const cookieVariant = req.cookies.get('entry_variant')?.value;
  if (cookieVariant === 'terminal' || cookieVariant === 'protocol' || cookieVariant === 'contest') {
    return cookieVariant;
  }

  return null;
}

/**
 * Client-side: Resolve variant with strict precedence.
 * 1. ?v= query param (highest - always respected)
 * 2. entry_variant cookie (unless terminal + user already discovered terminal)
 * 3. Weighted random using NEXT_PUBLIC_ENTRY_SPLIT_* env vars
 *
 * Returning users who completed terminal discovery: do NOT force them back to terminal.
 * Default routing favors protocol/contest for variety.
 *
 * Call this ONLY when routing (e.g. after Lightning video ends or Continue click).
 * Do NOT call on page load - user must see Lightning first.
 */
export function resolveVariantClient(): 'terminal' | 'protocol' | 'contest' {
  if (typeof window === 'undefined') return 'contest';

  const params = new URLSearchParams(window.location.search);
  const queryV = params.get('v');
  if (queryV === 'terminal' || queryV === 'protocol' || queryV === 'contest') {
    return queryV;
  }

  const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
  const cookieV = cookieMatch?.[1]?.trim();
  const hasTerminalDiscoveryComplete = typeof document !== 'undefined' &&
    document.cookie.split(';').some((c) => c.trim().startsWith('terminal_discovery_complete=1'));

  // Returning user who already discovered terminal: skip terminal cookie, favor protocol/contest
  if (cookieV === 'terminal' && hasTerminalDiscoveryComplete) {
    return assignWeightedVariantNoTerminal();
  }

  if (cookieV === 'terminal' || cookieV === 'protocol' || cookieV === 'contest') {
    return cookieV;
  }

  return assignWeightedVariant();
}

/**
 * Weighted random assignment. Uses NEXT_PUBLIC_ENTRY_SPLIT_* env vars.
 * Default: 25 terminal, 35 protocol, 40 contest.
 */
function assignWeightedVariant(): 'terminal' | 'protocol' | 'contest' {
  const terminal = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_TERMINAL || '25', 10) || 25;
  const protocol = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL || '35', 10) || 35;
  const contest = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_CONTEST || '40', 10) || 40;

  const total = terminal + protocol + contest;
  const r = Math.random() * (total || 100);

  if (r < terminal) return 'terminal';
  if (r < terminal + protocol) return 'protocol';
  return 'contest';
}

/**
 * Weighted random between protocol and contest only (no terminal).
 * Used for returning users who already discovered terminal - avoid forcing them back.
 * Default: 60 protocol, 40 contest (Protocol Challenge has narrative hook).
 */
function assignWeightedVariantNoTerminal(): 'protocol' | 'contest' {
  const protocol = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL || '60', 10) || 60;
  const contest = parseInt(process.env.NEXT_PUBLIC_ENTRY_SPLIT_CONTEST || '40', 10) || 40;

  const total = protocol + contest;
  const r = Math.random() * (total || 100);

  return r < protocol ? 'protocol' : 'contest';
}

/**
 * Set entry_variant cookie (client-side) for consistency on refresh
 */
export function setVariantCookieClient(variant: 'terminal' | 'protocol' | 'contest'): void {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 7; // 7 days
  document.cookie = `entry_variant=${variant}; path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = `dq_entry_variant=${variant}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Log entry variant for analytics (non-blocking)
 */
export function logEntryVariant(action: string, variant: EntryVariant, metadata?: Record<string, unknown>) {
  if (variant) {
    console.log(`[ENTRY_VARIANT] ${action}`, {
      variant,
      ...metadata,
    });
  }
}
