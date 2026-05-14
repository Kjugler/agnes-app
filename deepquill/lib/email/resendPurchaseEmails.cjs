// Admin / tooling: resend purchase-related emails without mutating Purchase or Order rows.

const mailchimp = require('@mailchimp/mailchimp_transactional');
const { stripe } = require('../../src/lib/stripe.cjs');
const envConfig = require('../../src/config/env.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { getPointsRollupForUser } = require('../pointsRollup.cjs');
const {
  buildPurchaseConfirmationEmail,
  buildClaimReaderProfileEmail,
} = require('../../src/lib/purchaseEmail.cjs');
const { buildEbookFulfillmentEmail } = require('../../src/lib/fulfillmentEmail.cjs');
const { signToken } = require('../../src/lib/fulfillmentToken.cjs');
const { signReaderClaimToken } = require('../../src/lib/readerClaimToken.cjs');
const { normalizeEmailDeliveryOutcome } = require('./mandrillDeliveryOutcome.cjs');
const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');

function getMailchimpClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) return null;
  return mailchimp(apiKey);
}

function resolveSiteUrl() {
  return String(process.env.APP_BASE_URL || envConfig.SITE_URL || 'https://theagnesprotocol.com').replace(/\/$/, '');
}

async function resolveProductFromSession(session) {
  let product = session.metadata?.product || null;
  if (!product) {
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ['data.price'],
      });
      const priceId = lineItems?.data?.[0]?.price?.id;
      if (priceId === envConfig.STRIPE_PRICE_PAPERBACK) product = 'paperback';
      else if (priceId === envConfig.STRIPE_PRICE_EBOOK) product = 'ebook';
      else if (priceId === envConfig.STRIPE_PRICE_AUDIO_PREORDER) product = 'audio_preorder';
    } catch {
      /* ignore */
    }
  }
  return product || 'unknown';
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} purchaseId
 */
async function loadPurchaseForResend(prismaClient, purchaseId) {
  ensureDatabaseUrl();
  const purchase = await prismaClient.purchase.findUnique({
    where: { id: purchaseId },
    include: { user: true },
  });
  if (!purchase) {
    return { ok: false, error: 'purchase_not_found' };
  }
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(purchase.sessionId);
  } catch (e) {
    return { ok: false, error: 'stripe_session_unavailable', detail: e?.message };
  }
  const product = await resolveProductFromSession(session);
  const customerEmail = normalizeEmail(
    session.customer_details?.email || session.customer_email || purchase.user?.email || ''
  );
  if (!customerEmail) {
    return { ok: false, error: 'missing_customer_email' };
  }
  return { ok: true, purchase, session, product, customerEmail };
}

async function sendWithMailchimp({ to, subject, text, html, action, meta = {} }) {
  const client = getMailchimpClient();
  if (!client) {
    return {
      ok: false,
      error: 'mailchimp_not_configured',
      deliveryStatus: 'error',
    };
  }
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
  let emailResult;
  try {
    emailResult = await client.messages.send({
      message: {
        from_email: fromEmail,
        from_name: 'The Agnes Protocol',
        subject,
        to: [{ email: to, type: 'to' }],
        text,
        html,
      },
    });
  } catch (err) {
    console.error('[ADMIN_RESEND] provider threw', { action, ...meta, error: err?.message });
    return {
      ok: false,
      error: 'send_failed',
      detail: err?.message,
      deliveryStatus: 'error',
    };
  }
  const delivery = normalizeEmailDeliveryOutcome(emailResult);
  console.log('[ADMIN_RESEND]', {
    action,
    ...meta,
    to,
    deliveryStatus: delivery.deliveryStatus,
    rejectReason: delivery.rejectReason,
    providerMessageId: delivery.providerMessageId,
  });
  const accepted = delivery.deliveryStatus === 'sent' || delivery.deliveryStatus === 'queued';
  return {
    ok: accepted,
    deliveryStatus: delivery.deliveryStatus,
    rejectReason: delivery.rejectReason,
    queuedReason: delivery.queuedReason,
    providerMessageId: delivery.providerMessageId,
    rawStatus: delivery.rawStatus,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} purchaseId
 */
async function resendPurchaseConfirmation(prismaClient, purchaseId) {
  const loaded = await loadPurchaseForResend(prismaClient, purchaseId);
  if (!loaded.ok) return loaded;

  const { purchase, session, product, customerEmail } = loaded;
  const siteUrl = resolveSiteUrl();

  let downloadUrl = null;
  if (product === 'ebook' || product === 'paperback') {
    downloadUrl = `${siteUrl}/ebook/download?session_id=${encodeURIComponent(session.id)}`;
  }

  let claimAccountLink = null;
  if (purchase.userId && purchase.user) {
    try {
      const em = normalizeEmail(customerEmail || purchase.user.email || '');
      if (em) {
        const claimTok = signReaderClaimToken({
          userId: purchase.userId,
          email: em,
          purchaseId: purchase.id,
          sessionId: session.id,
        });
        claimAccountLink = `${siteUrl}/contest/claim?token=${encodeURIComponent(claimTok)}`;
      }
    } catch (e) {
      console.warn('[ADMIN_RESEND] claim link skipped', { error: e?.message, purchaseId });
    }
  }

  let buyerTotalPoints = null;
  if (purchase.userId) {
    try {
      const rollup = await getPointsRollupForUser(prismaClient, purchase.userId);
      buyerTotalPoints = rollup.totalPoints;
    } catch {
      /* optional */
    }
  }

  const { subject, text, html } = buildPurchaseConfirmationEmail({
    email: customerEmail,
    sessionId: session.id,
    product,
    amountTotal: session.amount_total ?? purchase.amount ?? 0,
    currency: session.currency || purchase.currency || 'usd',
    downloadUrl,
    pointsAwarded: { awarded: 0, reason: 'admin_resend' },
    totalPoints: buyerTotalPoints ?? undefined,
    claimAccountLink,
  });

  const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
    html,
    text,
    subject,
  });

  return sendWithMailchimp({
    to: customerEmail,
    subject: finalSubject || subject,
    text: finalText || text,
    html: finalHtml || html,
    action: 'resend_purchase_confirmation',
    meta: { purchaseId, sessionId: session.id },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} purchaseId
 */
async function resendEbookDownloadEmail(prismaClient, purchaseId) {
  const loaded = await loadPurchaseForResend(prismaClient, purchaseId);
  if (!loaded.ok) return loaded;

  const { session, product, customerEmail } = loaded;
  if (product !== 'ebook' && product !== 'paperback') {
    return { ok: false, error: 'product_has_no_ebook_delivery', product };
  }

  const siteUrl = resolveSiteUrl();
  let downloadUrl;
  let mode = 'paperback_bonus';

  if (product === 'paperback') {
    const token = signToken({ email: customerEmail, sessionId: session.id });
    downloadUrl = `${siteUrl}/api/ebook/download?token=${encodeURIComponent(token)}`;
    mode = 'paperback_bonus';
  } else {
    downloadUrl = `${siteUrl}/ebook/download?session_id=${encodeURIComponent(session.id)}`;
    mode = 'ebook_order';
  }

  const { subject, text, html } = buildEbookFulfillmentEmail({
    email: customerEmail,
    downloadUrl,
    ttlDays: envConfig.EBOOK_LINK_TTL_DAYS,
    mode,
  });

  const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
    html,
    text,
    subject,
  });

  return sendWithMailchimp({
    to: customerEmail,
    subject: finalSubject || subject,
    text: finalText || text,
    html: finalHtml || html,
    action: 'resend_ebook_download',
    meta: { purchaseId, sessionId: session.id, product },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} userId
 */
async function sendClaimReaderProfileEmail(prismaClient, userId) {
  ensureDatabaseUrl();
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user?.email) {
    return { ok: false, error: 'user_not_found_or_missing_email' };
  }
  const purchase = await prismaClient.purchase.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!purchase) {
    return { ok: false, error: 'no_purchase_for_user' };
  }
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(purchase.sessionId);
  } catch (e) {
    return { ok: false, error: 'stripe_session_unavailable', detail: e?.message };
  }
  const customerEmail = normalizeEmail(user.email);
  if (!customerEmail) {
    return { ok: false, error: 'missing_customer_email' };
  }

  const siteUrl = resolveSiteUrl();
  let claimAccountLink;
  try {
    const claimTok = signReaderClaimToken({
      userId: user.id,
      email: customerEmail,
      purchaseId: purchase.id,
      sessionId: session.id,
    });
    claimAccountLink = `${siteUrl}/contest/claim?token=${encodeURIComponent(claimTok)}`;
  } catch (e) {
    return { ok: false, error: 'claim_token_failed', detail: e?.message };
  }

  const { subject, text, html } = buildClaimReaderProfileEmail({
    claimAccountLink,
    toEmail: customerEmail,
  });

  const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
    html,
    text,
    subject,
  });

  return sendWithMailchimp({
    to: customerEmail,
    subject: finalSubject || subject,
    text: finalText || text,
    html: finalHtml || html,
    action: 'send_claim_reader_profile',
    meta: { userId, purchaseId: purchase.id, sessionId: session.id },
  });
}

module.exports = {
  resendPurchaseConfirmation,
  resendEbookDownloadEmail,
  sendClaimReaderProfileEmail,
  loadPurchaseForResend,
};
