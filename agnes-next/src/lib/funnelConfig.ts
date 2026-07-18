/**
 * Public funnel routing + contest-entry UX flags (build-time NEXT_PUBLIC_*).
 * See agnes-next/.env.example for Vercel configuration.
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

/** Cruise ship score background archived. Set NEXT_PUBLIC_SCORE_CRUISE_VISUAL_ENABLED=true to restore. */
export function isScoreCruiseVisualArchived(): boolean {
  return process.env.NEXT_PUBLIC_SCORE_CRUISE_VISUAL_ENABLED !== 'true';
}

/**
 * Readers Agree review bridge: orientation page + new-tab reviews + sample chapters CTA.
 * Set NEXT_PUBLIC_READERS_AGREE_DOROTHY_BRIDGE=1 to enable. Default off preserves auto-redirect.
 */
export function isReadersAgreeDorothyBridgeEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_READERS_AGREE_DOROTHY_BRIDGE?.trim();
  return v === '1' || v === 'true';
}

/**
 * Jody Concierge on sample chapters (Remember My Place).
 * Set NEXT_PUBLIC_JODY_CONCIERGE_ENABLED=1 to enable. Default off.
 */
export function isJodyConciergeEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_JODY_CONCIERGE_ENABLED?.trim();
  return v === '1' || v === 'true';
}

/**
 * Mobile chapter delivery — Jody welcome + email chapter + Continue Reading.
 * Set NEXT_PUBLIC_JODY_MOBILE_DELIVERY=1 to enable. Desktop unchanged.
 */
export function isJodyMobileDeliveryEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_JODY_MOBILE_DELIVERY?.trim();
  return v === '1' || v === 'true';
}
