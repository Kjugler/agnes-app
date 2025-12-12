const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const {
  MAILCHIMP_TRANSACTIONAL_KEY,
  MAILCHIMP_FROM_EMAIL,
  SITE_ROOT
} = process.env;

const siteRoot = SITE_ROOT || 'https://TheAgnesProtocol.com';

// Only create transporter if Mandrill config is available
let transporter = null;
if (MAILCHIMP_TRANSACTIONAL_KEY && MAILCHIMP_FROM_EMAIL) {
  transporter = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: {
      // Mandrill lets us use ANY username; the API key goes in `pass`.
      user: 'DeepQuill LLC',
      pass: MAILCHIMP_TRANSACTIONAL_KEY,
    },
  });
  console.log('[REFER-FRIEND] Mandrill SMTP transport configured');
} else {
  console.warn(
    '[REFER-FRIEND] Email service not configured – missing MAILCHIMP_TRANSACTIONAL_KEY or MAILCHIMP_FROM_EMAIL'
  );
}

router.post('/', async (req, res) => {
  try {
    const {
      friendEmail,
      friendEmails,
      friendName,
      fromEmail,
      referrerEmail,
      note,
      videoVariant,
      videoId,
      associateCode,
      referralCode
    } = req.body || {};

    // Support both singular friendEmail and plural friendEmails array
    const emails = friendEmails && Array.isArray(friendEmails) && friendEmails.length > 0
      ? friendEmails.filter(e => e && typeof e === 'string' && e.trim())
      : friendEmail
      ? [friendEmail]
      : [];

    const code = associateCode || referralCode;

    if (emails.length === 0 || !code) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: friendEmail/friendEmails or associateCode/referralCode'
      });
    }

    // Use referrerEmail if provided, otherwise fromEmail
    const referrer = (referrerEmail && referrerEmail.trim()) || (fromEmail && fromEmail.trim()) || 'a friend';
    const safeFriendName = friendName && friendName.trim() ? friendName.trim() : 'there';

    const refLink = `${siteRoot}/?ref=${encodeURIComponent(code)}`;

    // Map videoId to videoLabel (support both videoId and videoVariant)
    const vidId = videoId || videoVariant;
    const videoLabel =
      vidId === 'fb2' || vidId === 'video2'
        ? 'Truth Under Siege'
        : vidId === 'fb3' || vidId === 'video3'
        ? 'Play. Win. Ascend.'
        : 'The Agnes Protocol Intro';

    if (!transporter) {
      return res.status(500).json({
        ok: false,
        error: 'Email service not configured'
      });
    }

    const subject = `A book I think you'll like (with my code ${code})`;

    // Send emails to all recipients
    const sendPromises = emails.map(async (email) => {
      const html = `
        <p>Hey ${safeFriendName},</p>
        <p>${referrer} asked us to send you a quick video and a link to a new thriller called <em>The Agnes Protocol</em>.</p>
        ${note ? `<p>${note.replace(/\n/g, '<br>')}</p>` : ''}
        <p><strong>Your discount code:</strong> ${code}</p>
        <p>Use it here to grab the book and join the contest:</p>
        <p><a href="${refLink}" target="_blank" rel="noopener noreferrer">${refLink}</a></p>
        <p>The video they chose: <strong>${videoLabel}</strong></p>
        <p style="margin-top:16px;">If you end up buying, they'll earn $2 for every copy purchased with this code.</p>
        <p>— DeepQuill LLC</p>
      `;

      await transporter.sendMail({
        from: `DeepQuill LLC <${MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com'}>`,
        to: email,
        subject,
        html,
        replyTo: MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com'
      });

      console.log('[refer-friend] Sent referral email to', email, 'for code', code);
    });

    await Promise.all(sendPromises);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[refer-friend] Error sending email', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to send referral email'
    });
  }
});

module.exports = router;

