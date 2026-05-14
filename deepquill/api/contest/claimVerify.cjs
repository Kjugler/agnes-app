// GET /api/contest/claim-verify?token=...
// Public: verifies signed reader_claim token and returns safe fields for the claim UI.

const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { verifyReaderClaimToken } = require('../../src/lib/readerClaimToken.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');

module.exports = async function contestClaimVerifyHandler(req, res) {
  const token = (req.query && req.query.token) || '';
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, error: 'token_required' });
  }

  const decoded = verifyReaderClaimToken(token.trim());
  if (!decoded) {
    return res.status(400).json({ ok: false, error: 'invalid_or_expired_token' });
  }

  try {
    ensureDatabaseUrl();
    const purchase = await prisma.purchase.findUnique({
      where: { id: decoded.purchaseId },
      select: { id: true, userId: true, sessionId: true },
    });
    if (!purchase || purchase.userId !== decoded.userId || purchase.sessionId !== decoded.sessionId) {
      return res.status(400).json({ ok: false, error: 'token_mismatch_purchase' });
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { email: true },
    });
    const dbEmail = normalizeEmail(user?.email || '');
    if (!dbEmail || dbEmail !== decoded.email) {
      return res.status(400).json({ ok: false, error: 'token_mismatch_user' });
    }

    return res.json({
      ok: true,
      email: decoded.email,
      purchaseId: decoded.purchaseId,
      sessionId: decoded.sessionId,
      userId: decoded.userId,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[contest/claim-verify]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
