// POST /api/jody/remember/request
// Body: { email, chapterId }

const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { signRememberPlaceToken } = require('../../src/lib/rememberPlaceToken.cjs');
const { buildRememberPlaceEmail } = require('../../src/lib/purchaseEmail.cjs');
const { sendEmail } = require('../../lib/email/sendEmail.cjs');
const { isValidChapterId } = require('../../lib/readers/jodyReaderState.cjs');
const { ensureAssociateMinimal } = require('../contest/login.cjs');
const { prisma } = require('../../server/prisma.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');

function siteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://www.theagnesprotocol.com'
  ).replace(/\/$/, '');
}

function isTransactionalEmailEnabled() {
  return process.env.TRANSACTIONAL_EMAIL_ENABLED === '1';
}

module.exports = async function jodyRememberRequestHandler(req, res) {
  try {
    ensureDatabaseUrl();
    const { email: emailRaw, chapterId } = req.body || {};

    if (!emailRaw || typeof emailRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'email_required' });
    }
    if (!chapterId || !isValidChapterId(chapterId)) {
      return res.status(400).json({ ok: false, error: 'invalid_chapter_id' });
    }

    const email = normalizeEmail(emailRaw);
    if (!email) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    const user = await ensureAssociateMinimal(email);
    if (!user?.id) {
      return res.status(500).json({ ok: false, error: 'user_create_failed' });
    }

    const token = signRememberPlaceToken({
      userId: user.id,
      email,
      chapterId: String(chapterId),
    });

    const verifyLink = `${siteUrl()}/reader/jody-verify?token=${encodeURIComponent(token)}`;
    const { subject, text, html } = buildRememberPlaceEmail({ verifyLink, toEmail: email });

    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
    const fromName = process.env.MAILCHIMP_FROM_NAME || 'The Agnes Protocol';

    const emailEnabled = isTransactionalEmailEnabled();
    if (emailEnabled) {
      await sendEmail({
        fromEmail,
        fromName,
        to: email,
        subject,
        html,
        text,
      });
    } else {
      console.log('[jody/remember/request] Email disabled — verify link:', verifyLink);
    }

    await recordServerFunnelEvent(prisma, {
      type: FUNNEL_EVENT_TYPES.JODY_EMAIL_ENTERED,
      userId: user.id,
      meta: { chapterId: String(chapterId), emailDomain: email.split('@')[1] || null },
    });

    return res.json({
      ok: true,
      email,
      emailSent: emailEnabled,
    });
  } catch (err) {
    console.error('[jody/remember/request]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
