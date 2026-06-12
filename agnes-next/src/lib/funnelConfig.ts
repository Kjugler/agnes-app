/**
 * Public funnel routing + contest-entry UX flags (build-time NEXT_PUBLIC_*).
 */

/** Lightning → /contest only. Set NEXT_PUBLIC_ENTRY_FUNNEL_CONTEST_ONLY=false to restore weighted split. */
export function isEntryFunnelContestOnly(): boolean {
  return process.env.NEXT_PUBLIC_ENTRY_FUNNEL_CONTEST_ONLY !== 'false';
}

/** When contest-only: allow ?v=protocol|terminal|contest for internal QA (staging). */
export function isEntryFunnelOverrideAllowed(): boolean {
  return process.env.NEXT_PUBLIC_ENTRY_FUNNEL_ALLOW_OVERRIDES === 'true';
}

/**
 * Hide hub/score contest enrollment CTAs. Set NEXT_PUBLIC_CONTEST_ENTRY_UX_ENABLED=true to restore.
 */
export function isContestEntryUxArchived(): boolean {
  return process.env.NEXT_PUBLIC_CONTEST_ENTRY_UX_ENABLED !== 'true';
}
