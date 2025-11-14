/**
 * A4: Enforce exact 50/50 split between challenge and terminal targets
 * Uses localStorage toggle to guarantee alternating distribution
 */
export type ShareTarget = 'challenge' | 'terminal';

export function getNextTarget(): ShareTarget {
  const storageKey = 'last_target_variant';
  const lastTarget = typeof window !== 'undefined'
    ? localStorage.getItem(storageKey) as ShareTarget | null
    : null;
  
  // Toggle: if last was challenge, next is terminal; otherwise challenge
  const next: ShareTarget = lastTarget === 'challenge' ? 'terminal' : 'challenge';
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(storageKey, next);
  }
  
  return next;
}

