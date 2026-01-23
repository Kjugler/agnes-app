// deepquill/src/lib/normalize.cjs
// Utility functions for normalizing emails, referral codes, and extracting names

/**
 * Normalize an email address:
 * - Convert to lowercase
 * - Trim whitespace
 * - Return null if invalid or empty
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  // Basic email validation
  if (!trimmed || !trimmed.includes('@') || trimmed.length < 3) {
    return null;
  }
  return trimmed;
}

/**
 * Normalize a referral code:
 * - Convert to uppercase
 * - Trim whitespace
 * - Return null if invalid or empty
 */
function normalizeReferralCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }
  const trimmed = code.trim().toUpperCase();
  if (!trimmed || trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

/**
 * Extract a display name from an email address:
 * - Takes the part before the @ symbol
 * - Capitalizes first letter
 * - Returns a friendly display name
 */
function extractNameFromEmail(email) {
  if (!email || typeof email !== 'string') {
    return 'Friend';
  }
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return 'Friend';
  }
  const localPart = normalized.split('@')[0];
  if (!localPart) {
    return 'Friend';
  }
  // Capitalize first letter
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

module.exports = {
  normalizeEmail,
  normalizeReferralCode,
  extractNameFromEmail,
};
