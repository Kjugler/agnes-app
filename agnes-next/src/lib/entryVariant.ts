import { NextRequest } from 'next/server';

export type EntryVariant = 'terminal' | 'protocol' | null;

/**
 * Get the entry variant from request cookies or query params
 * Returns null if no variant is found
 */
export function getEntryVariant(req: NextRequest): EntryVariant {
  // Check query param first (for testing/override)
  const queryVariant = req.nextUrl.searchParams.get('v');
  if (queryVariant === 'terminal' || queryVariant === 'protocol') {
    return queryVariant;
  }

  // Check cookie
  const cookieVariant = req.cookies.get('dq_entry_variant')?.value;
  if (cookieVariant === 'terminal' || cookieVariant === 'protocol') {
    return cookieVariant;
  }

  return null;
}

/**
 * Log entry variant for analytics (non-blocking)
 */
export function logEntryVariant(action: string, variant: EntryVariant, metadata?: Record<string, any>) {
  if (variant) {
    console.log(`[ENTRY_VARIANT] ${action}`, {
      variant,
      ...metadata,
    });
  }
}

