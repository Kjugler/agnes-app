const { normalizeEmail, isSyntheticReaderEmail } = require('../../src/lib/normalize.cjs');

const BLOCKED_EMAILS = new Set(['me@here.com', 'test@test.com', 'noreply@noreply.com']);
const BLOCKED_DOMAINS = new Set(['example.com', 'example.org', 'test.com', 'here.com']);

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function describeEmailTypo(domain) {
  if (!domain) return null;
  const lower = domain.toLowerCase();
  if (lower.endsWith('.comh') || lower.endsWith('.con') || lower.endsWith('.cmo')) {
    return 'Check the email domain — it looks like there may be a typo (for example "gmail.comh" instead of "gmail.com").';
  }
  if (lower.includes('.com.') || /\.com[a-z]{2,}$/.test(lower) && !lower.endsWith('.com')) {
    return 'Check the email domain — it looks like ".com" may have extra characters.';
  }
  return null;
}

/**
 * Validate email for Reader Manager create/edit.
 * Returns friendly, non-technical error messages for Kris.
 */
function validateAdminReaderEmail(emailRaw, options = {}) {
  const {
    required = false,
    hadRealEmail = false,
    hasPhone = false,
    hasNameAndNotes = false,
  } = options;

  const trimmed = typeof emailRaw === 'string' ? emailRaw.trim() : '';

  if (!trimmed) {
    if (required) {
      return { ok: false, error: 'Please enter an email address.' };
    }
    if (hadRealEmail && !hasPhone && !hasNameAndNotes) {
      return {
        ok: false,
        error:
          'This reader needs an email address, a phone number, or a name plus notes. Email cannot be removed without another way to identify them.',
      };
    }
    return { ok: true, normalizedEmail: null };
  }

  const normalized = normalizeEmail(trimmed);
  if (!normalized || !EMAIL_FORMAT_RE.test(normalized)) {
    return {
      ok: false,
      error: 'That does not look like a valid email address. Please check the spelling and try again.',
    };
  }

  if (isSyntheticReaderEmail(normalized)) {
    return {
      ok: false,
      error: 'Please enter a real email address, not an internal placeholder.',
    };
  }

  if (BLOCKED_EMAILS.has(normalized)) {
    return {
      ok: false,
      error: `"${trimmed}" looks like a placeholder address. Please enter the reader's real email.`,
    };
  }

  const domain = normalized.split('@')[1] || '';
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      ok: false,
      error: `"${domain}" is not allowed for production readers. Please use the reader's real email address.`,
    };
  }

  const typoHint = describeEmailTypo(domain);
  if (typoHint) {
    return { ok: false, error: typoHint };
  }

  return { ok: true, normalizedEmail: normalized };
}

module.exports = {
  validateAdminReaderEmail,
  describeEmailTypo,
};
