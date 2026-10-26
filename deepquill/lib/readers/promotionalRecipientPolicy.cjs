/**
 * Shared eligibility blocks for every promotional path.
 * Placeholder domains stay ineligible. A configured exclusion list can
 * name test recipients without treating a mail provider as a test account.
 * The list is empty unless PROMOTIONAL_EXCLUDED_EMAILS is set.
 */

const { normalizeEmail, isSyntheticReaderEmail } = require('../../src/lib/normalize.cjs');

const PLACEHOLDER_DOMAINS = new Set(['example.com', 'example.org', 'test.com', 'here.com']);
const PLACEHOLDER_EMAILS = new Set(['me@here.com', 'test@test.com', 'noreply@noreply.com']);

function excludedPromotionalEmails(env = process.env) {
  return new Set(
    String(env.PROMOTIONAL_EXCLUDED_EMAILS || '')
      .split(/[,;\s]+/)
      .map((value) => normalizeEmail(value))
      .filter(Boolean),
  );
}

function isPlaceholderPromotionalEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  if (isSyntheticReaderEmail(normalized) || PLACEHOLDER_EMAILS.has(normalized)) return true;
  const domain = normalized.split('@')[1] || '';
  return PLACEHOLDER_DOMAINS.has(domain);
}

function isExcludedPromotionalRecipient(email, env = process.env) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return excludedPromotionalEmails(env).has(normalized);
}

function promotionalRecipientBlock(email, env = process.env) {
  if (isPlaceholderPromotionalEmail(email)) return 'no_mailable_email';
  if (isExcludedPromotionalRecipient(email, env)) return 'test_recipient_excluded';
  return null;
}

module.exports = {
  excludedPromotionalEmails,
  isPlaceholderPromotionalEmail,
  isExcludedPromotionalRecipient,
  promotionalRecipientBlock,
};
