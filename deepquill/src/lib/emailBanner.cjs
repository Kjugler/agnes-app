// deepquill/src/lib/emailBanner.cjs
// Global test contest banner injection for all emails
//
// CANONICAL FLAG: STRESS_TEST_MODE=1 is the master. When set, email stress-test
// messaging turns on automatically. EMAIL_CONTEST_BANNER=1 is legacy override.

const STRESS_TEST_MODE = process.env.STRESS_TEST_MODE === '1';
const EMAIL_CONTEST_BANNER_ENV = process.env.EMAIL_CONTEST_BANNER;
const EMAIL_CONTEST_BANNER_LEGACY = EMAIL_CONTEST_BANNER_ENV === '1' || (EMAIL_CONTEST_BANNER_ENV && typeof EMAIL_CONTEST_BANNER_ENV === 'string' && EMAIL_CONTEST_BANNER_ENV.length > 0);
const EMAIL_CONTEST_BANNER_TEXT = EMAIL_CONTEST_BANNER_ENV && EMAIL_CONTEST_BANNER_ENV !== '1' ? EMAIL_CONTEST_BANNER_ENV : null;

// Banner enabled when STRESS_TEST_MODE or EMAIL_CONTEST_BANNER is set
const EMAIL_CONTEST_BANNER = STRESS_TEST_MODE || EMAIL_CONTEST_BANNER_LEGACY;
const EMAIL_CONTEST_BANNER_MODE = process.env.EMAIL_CONTEST_BANNER_MODE || 'test';

// Short, tasteful banner — not dominate
const BANNER_HTML = `
<p style="margin: 0 0 16px 0; padding: 12px 16px; background-color: #f8f9fa; border-left: 4px solid #6c757d; font-size: 13px; line-height: 1.5; color: #495057; font-family: Arial, Helvetica, sans-serif;">
  Public beta stress test: purchases are simulated. No real charges or deliveries will occur.
</p>
`;

const BANNER_TEXT = `Public beta stress test: purchases are simulated. No real charges or deliveries will occur.

`;

function getBannerContent() {
  if (EMAIL_CONTEST_BANNER_TEXT) {
    return {
      html: `<p style="margin: 0 0 16px 0; padding: 12px 16px; background-color: #f8f9fa; border-left: 4px solid #6c757d; font-size: 13px; line-height: 1.5; color: #495057;"><strong>${EMAIL_CONTEST_BANNER_TEXT}</strong></p>`,
      text: `${EMAIL_CONTEST_BANNER_TEXT}\n\n`,
    };
  }
  return { html: BANNER_HTML, text: BANNER_TEXT };
}

/**
 * Apply global test contest banner to email content
 * @param {Object} params
 * @param {string} [params.html] - HTML email body
 * @param {string} [params.text] - Plain text email body
 * @param {string} [params.subject] - Email subject (will be prefixed with [TEST CONTEST] if banner enabled)
 * @returns {Object} { html, text, subject }
 */
function applyGlobalEmailBanner({ html, text, subject }) {
  // If banner is disabled, return unchanged
  if (!EMAIL_CONTEST_BANNER) {
    return { html, text, subject };
  }

  // Guard against double-injection
  const hasBannerMarker =
    (html && (html.includes('Public beta stress test') || html.includes('PUBLIC STRESS TEST ACTIVE') || html.includes('PUBLIC BETA TEST'))) ||
    (text && (text.includes('Public beta stress test') || text.includes('[PUBLIC BETA TEST]')));

  if (hasBannerMarker) {
    console.log('[emailBanner] Banner already present, skipping injection');
    return { html, text, subject };
  }

  const result = { html, text, subject };
  const bannerContent = getBannerContent();

  // Inject HTML banner if HTML body exists
  if (html) {
    result.html = bannerContent.html + html;
  }

  // Inject text banner if text body exists
  if (text) {
    result.text = bannerContent.text + text;
  }

  // Prefix subject with [PUBLIC BETA TEST] if not already present
  if (subject && !subject.includes('[PUBLIC BETA TEST]') && !subject.includes('[PUBLIC STRESS TEST]')) {
    result.subject = `[PUBLIC BETA TEST] ${subject}`;
  }

  return result;
}

module.exports = {
  applyGlobalEmailBanner,
  EMAIL_CONTEST_BANNER,
  EMAIL_CONTEST_BANNER_MODE,
};

