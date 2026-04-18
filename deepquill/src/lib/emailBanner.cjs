// deepquill/src/lib/emailBanner.cjs
// Global email wrapper — previously injected beta/stress contest banners; disabled for production.

/**
 * Beta/stress email injection was removed (2026). Purchase and fulfillment emails are sent as-is.
 *
 * Historical flags (no longer apply banner/subject prefix):
 * - STRESS_TEST_MODE
 * - EMAIL_CONTEST_BANNER
 *
 * Exports EMAIL_CONTEST_BANNER / EMAIL_CONTEST_BANNER_MODE for backward compatibility; both reflect "off".
 */
const EMAIL_CONTEST_BANNER = false;
const EMAIL_CONTEST_BANNER_MODE = 'off';

/**
 * @param {Object} params
 * @param {string} [params.html]
 * @param {string} [params.text]
 * @param {string} [params.subject]
 * @returns {Object} { html, text, subject } unchanged
 */
function applyGlobalEmailBanner({ html, text, subject }) {
  return { html, text, subject };
}

module.exports = {
  applyGlobalEmailBanner,
  EMAIL_CONTEST_BANNER,
  EMAIL_CONTEST_BANNER_MODE,
};
