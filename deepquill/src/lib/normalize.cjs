// deepquill/src/lib/normalize.cjs
// Utility functions for normalizing emails, referral codes, and extracting names

const SYNTHETIC_READER_EMAIL_DOMAIN = 'reader.crm';

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
 * Normalize a phone number (US-first):
 * - 10 digits → +1XXXXXXXXXX
 * - 11 digits starting with 1 → +1XXXXXXXXXX
 * - Returns null if invalid or empty
 */
function normalizePhone(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return null;
  }
  if (input.trim().startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return null;
}

/** Internal CRM placeholder emails — never mailable. */
function isSyntheticReaderEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return normalized.endsWith(`@${SYNTHETIC_READER_EMAIL_DOMAIN}`);
}

/** Real mailable address, or null for synthetic/invalid. */
function isMailableEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || isSyntheticReaderEmail(normalized)) {
    return null;
  }
  return normalized;
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
  SYNTHETIC_READER_EMAIL_DOMAIN,
  normalizeEmail,
  normalizePhone,
  isSyntheticReaderEmail,
  isMailableEmail,
  normalizeReferralCode,
  extractNameFromEmail,
};
