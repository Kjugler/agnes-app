/**
 * Production switch for automated promotional nurturing.
 * Unset or any value other than "1" keeps sending off.
 * This does not change purchase receipts or other transactional mail.
 */
function nurturingSendEnabled(env = process.env) {
  return String(env.NURTURE_PROMOTIONAL_SENDING || '') === '1';
}

module.exports = {
  nurturingSendEnabled,
};
