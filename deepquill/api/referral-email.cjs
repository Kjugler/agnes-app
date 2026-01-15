// deepquill/api/referral-email.cjs
// Endpoint for sending referral emails via Mailchimp
// Proxied from agnes-next to keep Mailchimp credentials in deepquill

const express = require('express');
const router = express.Router();
const mailchimp = require('@mailchimp/mailchimp_transactional');
const { applyGlobalEmailBanner } = require('../src/lib/emailBanner.cjs');

function getClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[referral-email] MAILCHIMP_TRANSACTIONAL_KEY missing');
    return null;
  }
  return mailchimp(apiKey);
}

router.post('/', async (req, res) => {
  try {
    const {
      toEmail,
      referralUrl,
      thumbnailUrl,
      videoLabel,
      referrerEmail,
      referrerName,
    } = req.body;

    if (!toEmail || !referralUrl) {
      return res.status(400).json({
        ok: false,
        error: 'toEmail and referralUrl are required',
      });
    }

    const client = getClient();
    if (!client) {
      return res.status(500).json({
        ok: false,
        error: 'Mailchimp not configured',
      });
    }

    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';

    // Compute display name with fallback
    const baseName =
      referrerName && referrerName.trim().length > 0
        ? referrerName.trim()
        : 'Your friend';

    const fromName = `${baseName} via The Agnes Protocol`;
    const baseSubject = "You've Got to Read This Book!";

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <p>Hey there,</p>
          <p>${baseName} is part of the launch team for a new book called <strong>"The Agnes Protocol."</strong></p>
          <p>If you decide to grab a copy, this link gives you <strong>$3.90 off</strong> the regular price:</p>
          <p style="text-align: center; margin: 20px 0;">
            <a href="${referralUrl}" style="display: inline-block;">
              <img
                src="${thumbnailUrl || ''}"
                alt="${videoLabel || 'Referral Link'}"
                style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
              />
            </a>
          </p>
          <p style="text-align: center;">
            <a href="${referralUrl}" style="display: inline-block; padding: 12px 24px; background-color: #9333ea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Your discount link: Save $3.90
            </a>
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Or click here: <a href="${referralUrl}" style="color: #9333ea;">${referralUrl}</a>
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Every time someone uses my link, I earn $2—and you still get the full discount.
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Most people who buy do it in the first four months, so if you're curious, don't wait too long.
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Either way, thanks for checking it out.
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            — ${baseName}
          </p>
        </body>
      </html>
    `;

    const textBody = `Hey there,

${baseName} is part of the launch team for a new book called "The Agnes Protocol."

If you decide to grab a copy, this link gives you $3.90 off the regular price:

Your discount link:
${referralUrl}

Every time someone uses my link, I earn $2—and you still get the full discount.

Most people who buy do it in the first four months, so if you're curious, don't wait too long.

Either way, thanks for checking it out.

— ${baseName}`;

    // Apply global email banner if enabled
    const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
      html: htmlBody,
      text: textBody,
      subject: baseSubject,
    });

    const toList = [{ email: toEmail, type: 'to' }];

    const alertEmail = process.env.ORDER_ALERT_EMAIL;
    if (alertEmail) {
      toList.push({ email: alertEmail, type: 'bcc', name: 'DeepQuill Orders' });
    }

    console.log('[referral-email] Sending referral email', {
      toEmail,
      fromName,
      referralUrl,
    });

    await client.messages.send({
      message: {
        from_email: fromEmail,
        from_name: fromName,
        subject: finalSubject || baseSubject,
        to: toList,
        text: finalText || textBody,
        html: finalHtml || htmlBody,
        ...(referrerEmail
          ? {
              headers: {
                'Reply-To': referrerEmail,
              },
            }
          : {}),
      },
    });

    console.log('[referral-email] Referral email sent successfully', {
      toEmail,
      referralUrl,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[referral-email] Error sending referral email', {
      error: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to send email',
    });
  }
});

module.exports = router;

