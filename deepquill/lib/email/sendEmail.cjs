// deepquill/lib/email/sendEmail.cjs
// Wraps Mailchimp send; passes content through applyGlobalEmailBanner (no-op; legacy banner removed).

const mailchimp = require('@mailchimp/mailchimp_transactional');

/**
 * Get Mailchimp client (singleton)
 */
function getMailchimpClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[EMAIL] MAILCHIMP_TRANSACTIONAL_KEY not set - email sending disabled');
    return null;
  }
  return mailchimp(apiKey);
}

/** Pass-through hook (global beta banner disabled in emailBanner.cjs). */
function applyContestBanner(html, text, subject) {
  const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');
  return applyGlobalEmailBanner({ html, text, subject });
}

/**
 * Send email via Mailchimp Transactional
 * Applies applyGlobalEmailBanner (identity) before send
 * @param {Object} params
 * @param {string} params.fromEmail - From email address
 * @param {string} params.fromName - From name
 * @param {string|Array} params.to - To email(s)
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML email body
 * @param {string} params.text - Plain text email body
 * @returns {Promise<Object>} Mailchimp API response
 */
async function sendEmail({ fromEmail, fromName, to, subject, html, text }) {
  const client = getMailchimpClient();
  if (!client) {
    throw new Error('[EMAIL] Mailchimp client not available');
  }

  const bannerResult = applyContestBanner(html, text, subject);
  const finalHtml = bannerResult.html;
  const finalText = bannerResult.text;
  const finalSubject = bannerResult.subject;

  // Normalize to array
  const toList = Array.isArray(to) ? to : [{ email: to }];

  try {
    const result = await client.messages.send({
      message: {
        from_email: fromEmail,
        from_name: fromName || 'The Agnes Protocol',
        to: toList,
        subject: finalSubject || subject,
        html: finalHtml,
        text: finalText,
      },
    });

    return result;
  } catch (error) {
    console.error('[EMAIL] Error sending email', {
      error: error.message,
      to,
      subject,
    });
    throw error;
  }
}

module.exports = {
  sendEmail,
  applyContestBanner,
  getMailchimpClient,
};
