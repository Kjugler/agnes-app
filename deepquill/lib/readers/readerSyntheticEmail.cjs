const { customAlphabet } = require('nanoid');
const {
  SYNTHETIC_READER_EMAIL_DOMAIN,
  normalizeEmail,
  isSyntheticReaderEmail,
  isMailableEmail,
} = require('../../src/lib/normalize.cjs');

const anonId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

function buildSyntheticEmailForPhone(normalizedPhone) {
  const digits = String(normalizedPhone || '').replace(/\D/g, '');
  if (!digits) {
    throw new Error('Cannot build synthetic email without phone digits');
  }
  return `phone+${digits}@${SYNTHETIC_READER_EMAIL_DOMAIN}`;
}

function buildSyntheticEmailAnonymous() {
  return `anon+${anonId()}@${SYNTHETIC_READER_EMAIL_DOMAIN}`;
}

/** Display email for admin UI — null when synthetic or missing. */
function displayReaderEmail(email) {
  return isMailableEmail(email);
}

function deriveContactKind({ email, phone, firstName, lastName, notes }) {
  if (isMailableEmail(email)) return 'email';
  if ((phone || '').trim()) return 'phone';
  const hasName = Boolean((firstName || '').trim() || (lastName || '').trim());
  const hasNotes = (notes || '').trim().length >= 3;
  if (hasName && hasNotes) return 'name_notes';
  return 'unknown';
}

module.exports = {
  buildSyntheticEmailForPhone,
  buildSyntheticEmailAnonymous,
  displayReaderEmail,
  isSyntheticReaderEmail,
  isMailableEmail,
  deriveContactKind,
};
