/**
 * Canonical helper to get the site URL for server-side use
 * 
 * Precedence:
 * 1. process.env.NEXT_PUBLIC_SITE_URL (preferred - maintained for this app)
 * 2. process.env.SITE_URL (fallback - may be polluted)
 * 3. http://localhost:3002 (only in development)
 * 
 * Throws if localhost is detected in non-development environment
 * 
 * Returns { url, source } where source indicates which env var was used
 */

export function getSiteUrl(): { url: string; source: string } {
  const isDev = process.env.NODE_ENV === 'development';
  
  // Helper to validate and normalize URL
  const validateAndNormalize = (url: string, source: string): { url: string; source: string } => {
    let normalized = url.trim();
    // Strip trailing slash
    normalized = normalized.replace(/\/+$/, '');
    
    // Hard-block: Never allow deepquill ports (5055) in non-dev
    if (!isDev && normalized.includes(':5055')) {
      throw new Error(`${source} contains deepquill port (5055) in non-development environment: ${normalized}. Referral links must point to agnes-next, not deepquill.`);
    }
    
    // Hard-block: Never allow deepquill ports (5055) even in dev if explicitly set
    if (normalized.includes(':5055')) {
      throw new Error(`${source} contains deepquill port (5055): ${normalized}. Referral links must point to agnes-next (port 3002), not deepquill (port 5055).`);
    }
    
    // Validate: no localhost in production
    if (!isDev && (normalized.includes('localhost') || normalized.includes('127.0.0.1'))) {
      throw new Error(`${source} contains localhost in non-development environment: ${normalized}`);
    }
    
    return { url: normalized, source };
  };
  
  // Priority 1: NEXT_PUBLIC_SITE_URL (preferred - maintained for this app)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return validateAndNormalize(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL');
  }
  
  // Priority 2: SITE_URL (fallback - may be polluted, but hard-block prevents :5055)
  if (process.env.SITE_URL) {
    return validateAndNormalize(process.env.SITE_URL, 'SITE_URL');
  }
  
  // Priority 3: localhost only in development
  if (isDev) {
    const localhost = 'http://localhost:3002';
    return { url: localhost, source: 'localhost (dev fallback)' };
  }
  
  // Production fallback - should not happen if env is configured correctly
  throw new Error('NEXT_PUBLIC_SITE_URL or SITE_URL must be set in production environment');
}

