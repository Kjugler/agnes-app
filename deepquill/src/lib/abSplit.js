// deepquill/src/lib/abSplit.js
// A/B split logic for entry variant selection (ESM, frontend-safe)

/**
 * Choose entry variant (terminal or protocol)
 * Supports URL overrides, reset, and 24h cookie persistence
 * Pure JS - no Node-only imports, no CJS require
 */
export function chooseVariant() {
  if (typeof window === 'undefined') {
    return 'terminal'; // Default server-side
  }

  const params = new URLSearchParams(window.location.search);
  
  // 3.1: Canonical override parameters - only ?entry=protocol|terminal and ?ab_reset=1
  const entryOverride = params.get('entry');
  if (entryOverride === 'terminal' || entryOverride === 'protocol') {
    console.log('[AB] Entry override from URL:', entryOverride);
    return entryOverride;
  }

  // Reset switch
  if (params.get('ab_reset') === '1') {
    // Clear cookie/localStorage
    document.cookie = 'entry_variant=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('entry_variant');
      localStorage.removeItem('entry_variant_time');
    }
    console.log('[AB] Reset requested - cleared variant storage');
    // Continue to random selection below
  }

  // Check cookie (24h expiration)
  const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
  if (cookieMatch) {
    const cookieValue = cookieMatch[1];
    if (cookieValue === 'terminal' || cookieValue === 'protocol') {
      console.log('[AB] Variant from cookie:', cookieValue, '(source: cookie)');
      return cookieValue;
    }
  }

  // Check localStorage (fallback)
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('entry_variant');
    if (stored === 'terminal' || stored === 'protocol') {
      // Check if it's still valid (24h)
      const storedTime = localStorage.getItem('entry_variant_time');
      if (storedTime) {
        const age = Date.now() - parseInt(storedTime, 10);
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (age < twentyFourHours) {
          console.log('[AB] Variant from localStorage:', stored, '(source: localStorage)');
          return stored;
        } else {
          // Expired, clear it
          localStorage.removeItem('entry_variant');
          localStorage.removeItem('entry_variant_time');
        }
      }
    }
  }

  // Random selection (50/50 split)
  const variant = Math.random() < 0.5 ? 'terminal' : 'protocol';
  console.log('[AB] Random variant selected:', variant, '(source: random)');

  // Store in cookie (24h expiration)
  const expires = new Date();
  expires.setTime(expires.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  document.cookie = `entry_variant=${variant}; expires=${expires.toUTCString()}; path=/`;

  // Also store in localStorage with timestamp
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('entry_variant', variant);
    localStorage.setItem('entry_variant_time', Date.now().toString());
  }

  return variant;
}

/**
 * Get current variant (for display/debugging)
 */
export function getCurrentVariant() {
  if (typeof window === 'undefined') {
    return { variant: null, source: 'none' };
  }

  const params = new URLSearchParams(window.location.search);
  const entryOverride = params.get('entry');
  if (entryOverride === 'terminal' || entryOverride === 'protocol') {
    return { variant: entryOverride, source: 'override' };
  }

  const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
  if (cookieMatch && (cookieMatch[1] === 'terminal' || cookieMatch[1] === 'protocol')) {
    return { variant: cookieMatch[1], source: 'cookie' };
  }

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('entry_variant');
    if (stored === 'terminal' || stored === 'protocol') {
      return { variant: stored, source: 'localStorage' };
    }
  }

  return { variant: null, source: 'none' };
}
