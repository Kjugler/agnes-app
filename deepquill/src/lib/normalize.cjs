// deepquill/src/lib/normalize.cjs
// Safe string normalization helpers - never call .replace/.split/.trim on undefined

/**
 * Safely normalize email address
 * @param {string|undefined|null} value - Email to normalize
 * @returns {string|null} Normalized email or null if invalid
 */
function normalizeEmail(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  return value.trim().toLowerCase();
}

/**
 * Safely normalize referral code
 * @param {string|undefined|null} value - Referral code to normalize
 * @returns {string|null} Normalized code (uppercase, trimmed) or null if invalid
 */
function normalizeReferralCode(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch (err) {
    console.warn('[normalize] Error normalizing referral code', {
      value,
      valueType: typeof value,
      error: err.message,
    });
    return null;
  }
}

/**
 * Safely extract name from email
 * @param {string|undefined|null} email - Email address
 * @returns {string} Name extracted from email or 'someone' if invalid
 */
function extractNameFromEmail(email) {
  if (!email || typeof email !== 'string') {
    return 'someone';
  }
  try {
    const parts = email.split('@');
    if (parts.length === 0 || !parts[0]) {
      return 'someone';
    }
    const nameParts = parts[0].split('.');
    const firstName = nameParts[0] || 'someone';
    // Capitalize first letter
    return firstName.charAt(0).toUpperCase() + firstName.slice(1);
  } catch (err) {
    return 'someone';
  }
}

module.exports = {
  normalizeEmail,
  normalizeReferralCode,
  extractNameFromEmail,
};

