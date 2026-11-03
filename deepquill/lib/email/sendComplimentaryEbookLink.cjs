/**
 * Manual complimentary ebook link. Called only by the admin button.
 * The send log stores the outcome and provider id, never the download token or URL.
 */

const envConfig = require('../../src/config/env.cjs');
const { buildEbookFulfillmentEmail } = require('../../src/lib/fulfillmentEmail.cjs');
const { signComplimentaryEbookToken } = require('../../src/lib/fulfillmentToken.cjs');
const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');
const { sendWithMailchimp } = require('./resendPurchaseEmails.cjs');
const { authorizeComplimentaryEbookDownload } = require('../complimentaryEbookGrant.cjs');

function resolveSiteUrl() {
  return String(process.env.APP_BASE_URL || envConfig.SITE_URL || 'https://theagnesprotocol.com').replace(/\/$/, '');
}

async function sendComplimentaryEbookLink(prisma, grantId, deps = {}) {
  const id = String(grantId || '').trim();
  const grant = id
    ? await prisma.complimentaryEbookGrant.findUnique({ where: { id } })
    : null;
  if (!grant) return { ok: false, sent: false, error: 'grant_not_found' };

  const decision = await authorizeComplimentaryEbookDownload(prisma, {
    purpose: 'complimentary_ebook',
    grantId: grant.id,
    email: grant.email,
  }, deps.now);
  if (!decision.ok) {
    return { ok: false, sent: false, error: decision.reason };
  }

  const sign = deps.signToken || signComplimentaryEbookToken;
  const token = sign({ email: grant.email, grantId: grant.id });
  const siteUrl = deps.siteUrl || resolveSiteUrl();
  const downloadUrl = `${siteUrl}/api/ebook/download?token=${encodeURIComponent(token)}`;
  const { subject, text, html } = buildEbookFulfillmentEmail({
    email: grant.email,
    downloadUrl,
    ttlDays: envConfig.EBOOK_LINK_TTL_DAYS,
    mode: 'complimentary_review',
  });
  const banner = applyGlobalEmailBanner({ html, text, subject });
  const send = deps.send || sendWithMailchimp;
  const result = await send({
    to: grant.email,
    subject: banner.subject || subject,
    text: banner.text || text,
    html: banner.html || html,
    action: 'complimentary_ebook_link',
    meta: { grantId: grant.id },
  });

  const outcome = result && result.deliveryStatus ? result.deliveryStatus : (result && result.ok ? 'sent' : 'error');
  await prisma.complimentaryEbookSend.create({
    data: {
      grantId: grant.id,
      outcome,
      providerMessageId: result && result.providerMessageId ? String(result.providerMessageId) : null,
    },
  });

  return {
    ok: Boolean(result && result.ok),
    sent: true,
    deliveryStatus: result && result.deliveryStatus,
    rejectReason: result && result.rejectReason,
    providerMessageId: result && result.providerMessageId,
    error: result && result.ok ? null : (result && result.error) || 'send_failed',
  };
}

module.exports = {
  sendComplimentaryEbookLink,
};
