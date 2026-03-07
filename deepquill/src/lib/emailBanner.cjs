// deepquill/src/lib/emailBanner.cjs
// Global test contest banner injection for all emails

// E1: Support EMAIL_CONTEST_BANNER as string (custom banner text) or '1' (default banner)
const EMAIL_CONTEST_BANNER_ENV = process.env.EMAIL_CONTEST_BANNER;
const EMAIL_CONTEST_BANNER = EMAIL_CONTEST_BANNER_ENV === '1' || (EMAIL_CONTEST_BANNER_ENV && typeof EMAIL_CONTEST_BANNER_ENV === 'string' && EMAIL_CONTEST_BANNER_ENV.length > 0);
const EMAIL_CONTEST_BANNER_TEXT = EMAIL_CONTEST_BANNER_ENV && EMAIL_CONTEST_BANNER_ENV !== '1' ? EMAIL_CONTEST_BANNER_ENV : null;
const EMAIL_CONTEST_BANNER_MODE = process.env.EMAIL_CONTEST_BANNER_MODE || 'test';

// E1: Generate banner HTML/text based on EMAIL_CONTEST_BANNER env var
function getBannerContent() {
  if (EMAIL_CONTEST_BANNER_TEXT) {
    // E1: Custom banner text from env var
    return {
      html: `
<div style="background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
  <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #856404;">
    <strong>${EMAIL_CONTEST_BANNER_TEXT}</strong>
  </p>
</div>
`,
      text: `${EMAIL_CONTEST_BANNER_TEXT}\n\n`,
    };
  }
  
  // Default banner (when EMAIL_CONTEST_BANNER='1')
  return {
    html: `
<div style="background-color: #1a1a1a; border: 2px solid #00ff7f; padding: 16px 20px; margin-bottom: 24px; font-family: Arial, Helvetica, sans-serif;">
  <h2 style="margin: 0 0 12px 0; color: #00ff7f; font-size: 18px; font-weight: bold;">TEST CONTEST ACTIVE</h2>
  <p style="margin: 0 0 8px 0; color: #f5f5f5; font-size: 14px; line-height: 1.5;">You can win cash & prizes.</p>
  <p style="margin: 0 0 8px 0; color: #f5f5f5; font-size: 14px; line-height: 1.5;">Stripe Test Mode — no real charges.</p>
  <p style="margin: 0 0 8px 0; color: #f5f5f5; font-size: 14px; line-height: 1.5;">Use test card: <code style="background-color: #2a2a2a; padding: 2px 6px; border-radius: 3px; font-family: monospace;">4242 4242 4242 4242</code></p>
  <p style="margin: 0; color: #d0d0d0; font-size: 13px; line-height: 1.5;">If you experience any issues while testing the site, forward details to <a href="mailto:hello@theagnesprotocol.com" style="color: #00ff7f; text-decoration: underline;">hello@theagnesprotocol.com</a></p>
</div>
`,
    text: `[TEST CONTEST ACTIVE] You can win cash & prizes.
Stripe TEST MODE — no real charges. Use test card 4242 4242 4242 4242.
Issues? Forward details to hello@theagnesprotocol.com
---
`,
  };
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
    (html && html.includes('TEST CONTEST ACTIVE')) ||
    (text && text.includes('[TEST CONTEST ACTIVE]'));

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

  // Prefix subject with [TEST CONTEST] to prevent Gmail threading and make test emails unmistakable
  if (subject) {
    result.subject = `[TEST CONTEST] ${subject}`;
  }

  return result;
}

module.exports = {
  applyGlobalEmailBanner,
  EMAIL_CONTEST_BANNER,
  EMAIL_CONTEST_BANNER_MODE,
};

