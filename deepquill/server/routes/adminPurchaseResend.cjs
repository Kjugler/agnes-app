// POST /api/admin/purchases/:purchaseId/resend-confirmation
// POST /api/admin/purchases/:purchaseId/resend-ebook-link

const express = require('express');
const { prisma } = require('../prisma.cjs');
const {
  resendPurchaseConfirmation,
  resendEbookDownloadEmail,
} = require('../../lib/email/resendPurchaseEmails.cjs');

const router = express.Router();

function isAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.use((req, res, next) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
});

router.post('/:purchaseId/resend-confirmation', async (req, res) => {
  const purchaseId = req.params.purchaseId;
  try {
    const out = await resendPurchaseConfirmation(prisma, purchaseId);
    if (out.error === 'purchase_not_found') {
      console.warn('[adminPurchaseResend] resend-confirmation not found', { purchaseId });
      return res.status(404).json({ ok: false, ...out });
    }
    if (out.error === 'missing_customer_email' || out.error === 'stripe_session_unavailable') {
      console.warn('[adminPurchaseResend] resend-confirmation bad request', { purchaseId, error: out.error });
      return res.status(400).json({ ok: false, ...out });
    }
    if (!out.ok && out.error === 'mailchimp_not_configured') {
      console.error('[adminPurchaseResend] resend-confirmation mailchimp not configured', { purchaseId });
      return res.status(500).json({ ok: false, ...out });
    }
    const status = out.ok ? 200 : out.deliveryStatus === 'rejected' ? 502 : 500;
    if (out.ok) {
      console.log('[adminPurchaseResend] resend-confirmation success', {
        purchaseId,
        deliveryStatus: out.deliveryStatus,
        providerMessageId: out.providerMessageId,
      });
    } else {
      console.error('[adminPurchaseResend] resend-confirmation failed', {
        purchaseId,
        deliveryStatus: out.deliveryStatus,
        rejectReason: out.rejectReason,
        error: out.error,
      });
    }
    return res.status(status).json({ ok: out.ok, ...out });
  } catch (err) {
    console.error('[adminPurchaseResend] resend-confirmation', { purchaseId, error: err?.message || err });
    return res.status(500).json({ ok: false, error: err?.message || 'internal_error' });
  }
});

router.post('/:purchaseId/resend-ebook-link', async (req, res) => {
  const purchaseId = req.params.purchaseId;
  try {
    const out = await resendEbookDownloadEmail(prisma, purchaseId);
    if (out.error === 'purchase_not_found') {
      console.warn('[adminPurchaseResend] resend-ebook-link not found', { purchaseId });
      return res.status(404).json({ ok: false, ...out });
    }
    if (out.error === 'missing_customer_email' || out.error === 'stripe_session_unavailable') {
      console.warn('[adminPurchaseResend] resend-ebook-link bad request', { purchaseId, error: out.error });
      return res.status(400).json({ ok: false, ...out });
    }
    if (out.error === 'product_has_no_ebook_delivery') {
      console.warn('[adminPurchaseResend] resend-ebook-link no ebook product', { purchaseId });
      return res.status(400).json({ ok: false, ...out });
    }
    if (!out.ok && out.error === 'mailchimp_not_configured') {
      console.error('[adminPurchaseResend] resend-ebook-link mailchimp not configured', { purchaseId });
      return res.status(500).json({ ok: false, ...out });
    }
    const status = out.ok ? 200 : out.deliveryStatus === 'rejected' ? 502 : 500;
    if (out.ok) {
      console.log('[adminPurchaseResend] resend-ebook-link success', {
        purchaseId,
        deliveryStatus: out.deliveryStatus,
        providerMessageId: out.providerMessageId,
      });
    } else {
      console.error('[adminPurchaseResend] resend-ebook-link failed', {
        purchaseId,
        deliveryStatus: out.deliveryStatus,
        rejectReason: out.rejectReason,
        error: out.error,
      });
    }
    return res.status(status).json({ ok: out.ok, ...out });
  } catch (err) {
    console.error('[adminPurchaseResend] resend-ebook-link', { purchaseId, error: err?.message || err });
    return res.status(500).json({ ok: false, error: err?.message || 'internal_error' });
  }
});

module.exports = router;
