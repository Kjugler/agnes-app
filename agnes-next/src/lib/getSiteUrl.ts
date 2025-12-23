/**
 * Canonical helper to get the site URL for server-side use
 * 
 * Precedence:
 * 1. process.env.SITE_URL
 * 2. process.env.NEXT_PUBLIC_SITE_URL
 * 3. http://localhost:3002 (only in development)
 * 
 * Throws if localhost is detected in non-development environment
 */

export function getSiteUrl(): string {
  const isDev = process.env.NODE_ENV === 'development';
  
  // Priority 1: SITE_URL
  if (process.env.SITE_URL) {
    const url = process.env.SITE_URL.trim();
    if (isDev) {
      console.log('[getSiteUrl] Using SITE_URL:', url);
    }
    
    // Validate: no localhost in production
    if (!isDev && (url.includes('localhost') || url.includes('127.0.0.1'))) {
      throw new Error(`SITE_URL contains localhost in non-development environment: ${url}`);
    }
    
    return url;
  }
  
  // Priority 2: NEXT_PUBLIC_SITE_URL
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    const url = process.env.NEXT_PUBLIC_SITE_URL.trim();
    if (isDev) {
      console.log('[getSiteUrl] Using NEXT_PUBLIC_SITE_URL:', url);
    }
    
    // Validate: no localhost in production
    if (!isDev && (url.includes('localhost') || url.includes('127.0.0.1'))) {
      throw new Error(`NEXT_PUBLIC_SITE_URL contains localhost in non-development environment: ${url}`);
    }
    
    return url;
  }
  
  // Priority 3: localhost only in development
  if (isDev) {
    const localhost = 'http://localhost:3002';
    console.log('[getSiteUrl] Using localhost fallback (dev only):', localhost);
    return localhost;
  }
  
  // Production fallback - should not happen if env is configured correctly
  throw new Error('SITE_URL or NEXT_PUBLIC_SITE_URL must be set in production environment');
}

