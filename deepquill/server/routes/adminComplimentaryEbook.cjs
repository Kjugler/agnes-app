// Authenticated complimentary ebook grants.
// Creating a grant does not send email. The send route is the manual eBook link button.

const express = require('express');
const { prisma } = require('../prisma.cjs');
const {
  createComplimentaryEbookGrant,
  revokeComplimentaryEbookGrant,
} = require('../../lib/complimentaryEbookGrant.cjs');
const { sendComplimentaryEbookLink } = require('../../lib/email/sendComplimentaryEbookLink.cjs');

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

router.post('/', express.json(), async (req, res) => {
  try {
    const result = await createComplimentaryEbookGrant(prisma, req.body || {});
    if (!result.ok) {
      return res.status(400).json(result);
    }
    console.log('[complimentary-ebook] grant', {
      id: result.grant.id,
      created: result.created,
      status: result.grant.status,
    });
    return res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    console.error('[complimentary-ebook] create failed', { error: err?.message || 'error' });
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.post('/:grantId/send-link', async (req, res) => {
  const grantId = req.params.grantId;
  try {
    const result = await sendComplimentaryEbookLink(prisma, grantId);
    console.log('[complimentary-ebook] send', {
      grantId,
      ok: result.ok,
      sent: result.sent,
      deliveryStatus: result.deliveryStatus || null,
      error: result.error || null,
    });
    if (result.error === 'grant_not_found') {
      return res.status(404).json({ ok: false, error: result.error });
    }
    if (!result.sent) {
      return res.status(409).json({ ok: false, error: result.error });
    }
    const status = result.ok ? 200 : result.deliveryStatus === 'rejected' ? 502 : 500;
    return res.status(status).json({
      ok: result.ok,
      deliveryStatus: result.deliveryStatus || null,
      rejectReason: result.rejectReason || null,
      error: result.error || null,
    });
  } catch (err) {
    console.error('[complimentary-ebook] send failed', { grantId, error: err?.message || 'error' });
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.post('/:grantId/revoke', async (req, res) => {
  const grantId = req.params.grantId;
  try {
    const result = await revokeComplimentaryEbookGrant(prisma, grantId);
    if (!result.ok) return res.status(404).json(result);
    console.log('[complimentary-ebook] revoke', { grantId, status: result.grant.status });
    return res.json(result);
  } catch (err) {
    console.error('[complimentary-ebook] revoke failed', { grantId, error: err?.message || 'error' });
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
