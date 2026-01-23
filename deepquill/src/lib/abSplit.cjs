// deepquill/src/lib/abSplit.cjs
// A/B split logic for entry variant selection

/**
 * Choose entry variant (terminal or protocol)
 * Supports URL overrides, reset, and 24h cookie persistence
 */
function chooseVariant() {
  if (typeof window === 'undefined') {
    return 'terminal'; // Default server-side
  }

  const params = new URLSearchParams(window.location.search);
  
  // E1: Explicit override via URL
  const entryOverride = params.get('entry');
  if (entryOverride === 'terminal' || entryOverride === 'protocol') {
    console.log('[AB] Entry override from URL:', entryOverride);
    return entryOverride;
  }

  // E2: Reset switch
  if (params.get('ab_reset') === '1') {
    // Clear cookie/localStorage
    document.cookie = 'entry_variant=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('entry_variant');
    }
    console.log('[AB] Reset requested - cleared variant storage');
    // Continue to random selection below
  }

  // E3: Check cookie (24h expiration)
  const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
  if (cookieMatch) {
    const cookieValue = cookieMatch[1];
    if (cookieValue === 'terminal' || cookieValue === 'protocol') {
      console.log('[AB] Variant from cookie:', cookieValue, '(source: cookie)');
      return cookieValue;
    }
  }

  // E4: Check localStorage (fallback)
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

  // E5: Random selection (50/50 split)
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
function getCurrentVariant() {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const entryOverride = params.get('entry');
  if (entryOverride) {
    return { variant: entryOverride, source: 'override' };
  }

  const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
  if (cookieMatch) {
    return { variant: cookieMatch[1], source: 'cookie' };
  }

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('entry_variant');
    if (stored) {
      return { variant: stored, source: 'localStorage' };
    }
  }

  return { variant: null, source: 'none' };
}

module.exports = {
  chooseVariant,
  getCurrentVariant,
};
