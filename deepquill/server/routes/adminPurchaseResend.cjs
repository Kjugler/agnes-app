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
      return res.status(404).json({ ok: false, ...out });
    }
    if (out.error === 'missing_customer_email' || out.error === 'stripe_session_unavailable') {
      return res.status(400).json({ ok: false, ...out });
    }
    if (!out.ok && out.error === 'mailchimp_not_configured') {
      return res.status(500).json({ ok: false, ...out });
    }
    const status = out.ok ? 200 : out.deliveryStatus === 'rejected' ? 502 : 500;
    return res.status(status).json({ ok: out.ok, ...out });
  } catch (err) {
    console.error('[adminPurchaseResend] resend-confirmation', err);
    return res.status(500).json({ ok: false, error: err?.message || 'internal_error' });
  }
});

router.post('/:purchaseId/resend-ebook-link', async (req, res) => {
  const purchaseId = req.params.purchaseId;
  try {
    const out = await resendEbookDownloadEmail(prisma, purchaseId);
    if (out.error === 'purchase_not_found') {
      return res.status(404).json({ ok: false, ...out });
    }
    if (out.error === 'missing_customer_email' || out.error === 'stripe_session_unavailable') {
      return res.status(400).json({ ok: false, ...out });
    }
    if (out.error === 'product_has_no_ebook_delivery') {
      return res.status(400).json({ ok: false, ...out });
    }
    if (!out.ok && out.error === 'mailchimp_not_configured') {
      return res.status(500).json({ ok: false, ...out });
    }
    const status = out.ok ? 200 : out.deliveryStatus === 'rejected' ? 502 : 500;
    return res.status(status).json({ ok: out.ok, ...out });
  } catch (err) {
    console.error('[adminPurchaseResend] resend-ebook-link', err);
    return res.status(500).json({ ok: false, error: err?.message || 'internal_error' });
  }
});

module.exports = router;
