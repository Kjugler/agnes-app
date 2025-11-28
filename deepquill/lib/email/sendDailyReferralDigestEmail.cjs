// deepquill/lib/email/sendDailyReferralDigestEmail.cjs
const nodemailer = require('nodemailer');

// Re-use the same SMTP transport as other emails
let transporter = null;

function getSmtpTransporter() {
  if (transporter) return transporter;

  const host = process.env.HELP_SMTP_HOST;
  const user = process.env.HELP_SMTP_USER;
  const pass = process.env.HELP_SMTP_PASS;
  const port = Number(process.env.HELP_SMTP_PORT ?? 587);

  if (!host || !user || !pass) {
    console.warn('[DAILY_DIGEST] SMTP environment variables not fully configured.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // Use 'true' if your SMTP server uses SSL/TLS on port 465
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Send daily referral digest email to a referrer
 * @param {Object} params
 * @param {string} params.referrerEmail - Email address of the referrer
 * @param {string} params.digestDate - Date string in ISO format (e.g., "2025-11-27")
 * @param {Array} params.conversions - Array of conversion objects with buyerEmail, commissionCents, createdAt
 */
async function sendDailyReferralDigestEmail(params) {
  const { referrerEmail, digestDate, conversions } = params;

  const totalCents = conversions.reduce((sum, c) => sum + c.commissionCents, 0);
  const totalUsd = (totalCents / 100).toFixed(2);

  const friendLines = conversions.map((c) => {
    const who = c.buyerEmail || 'A friend';
    const amount = (c.commissionCents / 100).toFixed(2);
    return `${who} – $${amount}`;
  });

  const subject = `Your Agnes Protocol earnings for ${digestDate}: $${totalUsd}`;

  const textLines = [
    `Here is your referral summary for ${digestDate}:`,
    '',
    `Total referral earnings: $${totalUsd}`,
    '',
    'Friends who purchased using your code:',
    ...(friendLines.length ? friendLines : ['(No details available)']),
    '',
    'Thank you for spreading The Agnes Protocol.',
  ];

  const text = textLines.join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Here is your referral summary for <strong>${digestDate}</strong>:</p>
        <p><strong>Total referral earnings:</strong> $${totalUsd}</p>
        <p><strong>Friends who purchased using your code:</strong></p>
        <ul>
          ${
            friendLines.length
              ? friendLines.map((line) => `<li>${line}</li>`).join('')
              : '<li>(No details available)</li>'
          }
        </ul>
        <p>Thank you for spreading <em>The Agnes Protocol</em>.</p>
      </body>
    </html>
  `;

  const smtpClient = getSmtpTransporter();
  if (!smtpClient) {
    console.error('[DAILY_DIGEST] Skipping email send: SMTP transporter not configured.');
    return;
  }

  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
  const fromName = process.env.MAIL_FROM_NAME || process.env.MAILCHIMP_FROM_NAME || 'The Agnes Protocol';

  try {
    await smtpClient.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: referrerEmail,
      subject,
      text,
      html,
    });

    console.log('[DAILY_DIGEST] Email sent successfully to', referrerEmail);
  } catch (error) {
    console.error('[DAILY_DIGEST] Error sending email:', error);
    throw error;
  }
}

module.exports = { sendDailyReferralDigestEmail };

