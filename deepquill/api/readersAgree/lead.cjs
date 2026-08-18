// POST /api/readers-agree/lead — Phase D durable lead + Email 0 + nurture enroll

const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureAssociateMinimal } = require('../contest/login.cjs');
const { prisma } = require('../../server/prisma.cjs');
const { sendEmail } = require('../../lib/email/sendEmail.cjs');
const { buildProspectNurtureEmail } = require('../../lib/email/builders/prospectNurture.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');
const {
  buildLeadAttributionSnapshot,
  buildSampleChaptersUrlFromAttribution,
  buildRedirectPathFromAttribution,
  upsertReadersAgreeReaderProfile,
} = require('../../lib/readers/readersAgreeLead.cjs');

function isTransactionalEmailEnabled() {
  return process.env.TRANSACTIONAL_EMAIL_ENABLED === '1';
}

/** Best-effort Email 0 — must not block lead capture or redirect (see trySyncReaderProfileFromPurchase). */
function trySendProspectNurtureWelcome({ userId, email, sampleChaptersUrl }) {
  setImmediate(async () => {
    try {
      const { subject, html, text } = buildProspectNurtureEmail({
        step: 0,
        sampleChaptersUrl,
      });
      const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
      const fromName = process.env.MAILCHIMP_FROM_NAME || 'The Agnes Protocol';
      await sendEmail({
        fromEmail,
        fromName,
        to: email,
        subject,
        html,
        text,
      });
      await prisma.readerProfile.update({
        where: { userId },
        data: {
          prospectNurtureStep: 0,
          prospectNurtureLastSentAt: new Date(),
        },
      });
    } catch (err) {
      console.warn('[readers-agree/lead] Welcome email failed (non-blocking)', {
        userId,
        email,
        error: err?.message || String(err),
      });
    }
  });
}

module.exports = async function readersAgreeLeadHandler(req, res) {
  try {
    ensureDatabaseUrl();
    const body = req.body || {};
    const {
      email: emailRaw,
      visitorId,
      ref,
      code,
      utm,
      consentAccepted,
      captureSurface,
      retailerOrigin,
    } = body;

    if (!emailRaw || typeof emailRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'email_required' });
    }
    if (consentAccepted !== true) {
      return res.status(400).json({ ok: false, error: 'consent_required' });
    }

    const email = normalizeEmail(emailRaw);
    if (!email) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    const surface = captureSurface === 'bridge' ? 'bridge' : 'landing';
    const origin =
      retailerOrigin === 'amazon' || retailerOrigin === 'bn' ? retailerOrigin : null;

    const user = await ensureAssociateMinimal(email);
    if (!user?.id) {
      return res.status(500).json({ ok: false, error: 'user_create_failed' });
    }

    const attribution = buildLeadAttributionSnapshot({
      visitorId,
      ref: ref || null,
      code: code || null,
      utm: utm && typeof utm === 'object' ? utm : {},
      captureSurface: surface,
      retailerOrigin: origin,
    });

    const profile = await upsertReadersAgreeReaderProfile(prisma, user.id, {
      attribution,
      consentAccepted: true,
    });

    const sampleChaptersUrl = buildSampleChaptersUrlFromAttribution(attribution);
    const redirectPath = buildRedirectPathFromAttribution(attribution);

    const shouldSendWelcome =
      profile.prospectNurtureSuppressedAt == null && profile.prospectNurtureLastSentAt == null;

    const emailEnabled = isTransactionalEmailEnabled();
    const emailQueued = shouldSendWelcome && emailEnabled;

    if (emailQueued) {
      trySendProspectNurtureWelcome({ userId: user.id, email, sampleChaptersUrl });
    } else if (shouldSendWelcome && !emailEnabled) {
      console.log('[readers-agree/lead] Email disabled — welcome would send to', email, sampleChaptersUrl);
    }

    const eventType =
      surface === 'bridge'
        ? FUNNEL_EVENT_TYPES.READERS_AGREE_BRIDGE_EMAIL_SUBMITTED
        : FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED;

    await recordServerFunnelEvent(prisma, {
      type: eventType,
      userId: user.id,
      meta: {
        captureSurface: surface,
        retailerOrigin: origin,
        destination: 'sample-chapters',
        visitorId: visitorId || null,
        ref: attribution.ref,
        channel: attribution.channel,
        emailQueued,
      },
    });

    return res.json({
      ok: true,
      email,
      userId: user.id,
      redirectPath,
      emailQueued,
    });
  } catch (err) {
    console.error('[readers-agree/lead]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
