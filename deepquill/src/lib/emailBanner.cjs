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

const EMAIL_BETA_BANNER_MARKER = '<!--agnes-email-beta-banner-->';

// Jody bubble palette: linear-gradient(135deg, #ff3be0, #a100ff) — see agnes-next JodyAssistantTerminal
const BANNER_HTML = `
${EMAIL_BETA_BANNER_MARKER}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;max-width:100%;border-collapse:collapse;">
  <tr>
    <td style="background-color:#a100ff;background-image:linear-gradient(135deg,#ff3be0 0%,#a100ff 100%);padding:16px 18px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:15px;font-weight:bold;color:#ffffff;line-height:1.35;">
        🟣 LIVE BETA CONTEST ACTIVE
      </p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#faf5ff;line-height:1.45;">
        Earn points. Invite friends. Win cash and prizes.
      </p>
      <p style="margin:0 0 10px 0;font-size:14px;color:#faf5ff;line-height:1.45;">
        Top 15% unlock The Quiet Reveal.
      </p>
      <p style="margin:0;font-size:11px;line-height:1.45;color:#e9d5ff;">
        (All purchases are simulated)
      </p>
    </td>
  </tr>
</table>
`;

const BANNER_TEXT = `🟣 LIVE BETA CONTEST ACTIVE
Earn points. Invite friends. Win cash and prizes.
Top 15% unlock The Quiet Reveal.
(All purchases are simulated)


`;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBannerContent() {
  if (EMAIL_CONTEST_BANNER_TEXT) {
    const safe = escapeHtml(EMAIL_CONTEST_BANNER_TEXT);
    return {
      html: `
${EMAIL_BETA_BANNER_MARKER}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;max-width:100%;border-collapse:collapse;">
  <tr>
    <td style="background-color:#a100ff;background-image:linear-gradient(135deg,#ff3be0 0%,#a100ff 100%);padding:16px 18px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0;font-size:14px;line-height:1.5;color:#faf5ff;"><strong>${safe}</strong></p>
    </td>
  </tr>
</table>`,
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
  if (
    subject &&
    !subject.includes('[PUBLIC BETA TEST]') &&
    !subject.includes('[PUBLIC STRESS TEST]') &&
    !subject.includes('[TEST CONTEST]')
  ) {
    result.subject = `[PUBLIC BETA TEST] ${subject}`;
  }

  return result;
}

module.exports = {
  applyGlobalEmailBanner,
  EMAIL_CONTEST_BANNER,
  EMAIL_CONTEST_BANNER_MODE,
};

