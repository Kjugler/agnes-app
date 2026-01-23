// deepquill/api/referrals/invite.cjs
// Send referral invite emails via Mandrill SMTP transport
// Reuses existing email transport from /api/refer-friend

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const {
  MAILCHIMP_TRANSACTIONAL_KEY,
  MAILCHIMP_FROM_EMAIL,
} = process.env;

// Reuse the same transporter as /api/refer-friend
let transporter = null;
if (MAILCHIMP_TRANSACTIONAL_KEY && MAILCHIMP_FROM_EMAIL) {
  transporter = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: {
      user: 'DeepQuill LLC',
      pass: MAILCHIMP_TRANSACTIONAL_KEY,
    },
  });
  console.log('[REFERRALS/INVITE] Mandrill SMTP transport configured');
} else {
  console.warn(
    '[REFERRALS/INVITE] Email service not configured – missing MAILCHIMP_TRANSACTIONAL_KEY or MAILCHIMP_FROM_EMAIL'
  );
}

// Video config mapping (matches agnes-next REFER_VIDEOS)
const VIDEO_CONFIG = {
  fb1: {
    label: 'Video 1 – "Agnes Protocol Intro"',
    thumbnailPath: '/images/fb/fb1.png',
  },
  fb2: {
    label: 'Video 2 – "Truth Under Siege"',
    thumbnailPath: '/images/fb/fb2.png',
  },
  fb3: {
    label: 'Video 3 – "Play. Win. Ascend."',
    thumbnailPath: '/images/fb/fb3.png',
  },
};

/**
 * POST /api/referrals/invite
 * Request body:
 * {
 *   "emails": ["friend@example.com"],
 *   "referralCode": "ABC123",
 *   "videoId": "fb1",
 *   "referrerEmail": "kris.k.jugler@gmail.com",
 *   "origin": "https://simona-...ngrok-free.dev",
 *   "channel": "email"
 * }
 */
router.post('/', async (req, res) => {
  try {
    const {
      emails,
      referralCode,
      videoId = 'fb1',
      referrerEmail,
      origin,
      channel = 'email',
    } = req.body || {};

    // Validation
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'emails must be a non-empty array',
      });
    }

    if (emails.length > 10) {
      return res.status(400).json({
        ok: false,
        error: 'Maximum 10 emails per request',
      });
    }

    if (!referralCode || typeof referralCode !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'referralCode is required',
      });
    }

    if (!['fb1', 'fb2', 'fb3'].includes(videoId)) {
      return res.status(400).json({
        ok: false,
        error: 'videoId must be fb1, fb2, or fb3',
      });
    }

    if (!transporter) {
      return res.status(500).json({
        ok: false,
        error: 'Mandrill not configured',
      });
    }

    // Determine siteUrl: prefer origin if valid https://, else fallback to env
    let siteUrl = null;
    if (origin && typeof origin === 'string' && origin.startsWith('https://')) {
      siteUrl = origin.replace(/\/+$/, ''); // Remove trailing slashes
    } else {
      const envConfig = require('../src/config/env.cjs');
      siteUrl = envConfig.SITE_URL;
    }

    if (!siteUrl) {
      return res.status(500).json({
        ok: false,
        error: 'Site URL not configured',
      });
    }

    // Get video config
    const videoConfig = VIDEO_CONFIG[videoId] || VIDEO_CONFIG.fb1;

    // Build referral URL
    const referralUrlObj = new URL('/refer', siteUrl);
    referralUrlObj.searchParams.set('code', referralCode);
    referralUrlObj.searchParams.set('v', videoId);
    referralUrlObj.searchParams.set('src', 'email');
    const referralUrl = referralUrlObj.toString();

    // Build thumbnail URL
    const thumbnailUrlObj = new URL(videoConfig.thumbnailPath, siteUrl);
    const thumbnailUrl = thumbnailUrlObj.toString();

    console.log('[REFERRALS/INVITE] Sending referral emails', {
      emailCount: emails.length,
      referralCode,
      videoId,
      referralUrl,
      thumbnailUrl,
      siteUrl,
      origin,
    });

    // Email template (matches agnes-next format)
    const baseName = referrerEmail ? 'Your friend' : 'Your friend';
    const fromName = `${baseName} via The Agnes Protocol`;
    const subject = "You've Got to Read This Book!";

    // Send emails sequentially (to track failures)
    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const email of emails) {
      try {
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
                    src="${thumbnailUrl}"
                    alt="${videoConfig.label}"
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

        await transporter.sendMail({
          from: `DeepQuill LLC <${MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com'}>`,
          to: email,
          subject,
          html: htmlBody,
          text: textBody,
          replyTo: referrerEmail || MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com',
        });

        sent++;
        console.log('[REFERRALS/INVITE] Sent referral email to', email);
      } catch (err) {
        failed++;
        errors.push({ email, error: err.message });
        console.error('[REFERRALS/INVITE] Failed to send email to', email, err.message);
      }
    }

    if (sent === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to send any emails',
        sent: 0,
        failed,
        errors,
      });
    }

    return res.json({
      ok: true,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[REFERRALS/INVITE] Error', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
});

module.exports = router;
