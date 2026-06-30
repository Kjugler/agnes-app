const { isMailableEmail } = require('../../src/lib/normalize.cjs');

/**
 * Returns mailable address or null. Logs when blocking synthetic @reader.crm addresses.
 */
function guardMailableEmail(email, context = '') {
  const mailable = isMailableEmail(email);
  if (!mailable && email) {
    console.warn('[EMAIL] Blocked synthetic or invalid recipient', {
      context: context || 'unspecified',
      email: String(email).slice(0, 80),
    });
  }
  return mailable;
}

module.exports = {
  guardMailableEmail,
};
