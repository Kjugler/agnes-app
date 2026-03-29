/**
 * Canonical public entry for the cinematic funnel. Middleware redirects /start → /lightening
 * with query params preserved (see middleware.ts).
 * Use for system-generated marketing / acquisition links only — not post-checkout or in-app returns.
 */
export const ENTRY_FRONT_DOOR = '/start';
