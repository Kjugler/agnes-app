// GET /api/jody/remember/verify?token=...

const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { verifyRememberPlaceToken } = require('../../src/lib/rememberPlaceToken.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const {
  saveJodyReadingProgress,
  getJodyReaderState,
} = require('../../lib/readers/jodyReaderState.cjs');
const { extractNameFromEmail } = require('../../src/lib/normalize.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');

module.exports = async function jodyRememberVerifyHandler(req, res) {
  const token = (req.query && req.query.token) || '';
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, error: 'token_required' });
  }

  const decoded = verifyRememberPlaceToken(token.trim());
  if (!decoded) {
    return res.status(400).json({ ok: false, error: 'invalid_or_expired_token' });
  }

  try {
    ensureDatabaseUrl();
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, firstName: true, fname: true },
    });

    const dbEmail = normalizeEmail(user?.email || '');
    if (!user || !dbEmail || dbEmail !== decoded.email) {
      return res.status(400).json({ ok: false, error: 'token_mismatch_user' });
    }

    await saveJodyReadingProgress({
      userId: decoded.userId,
      chapterId: decoded.chapterId,
    });

    await recordServerFunnelEvent(prisma, {
      type: FUNNEL_EVENT_TYPES.JODY_EMAIL_VERIFIED,
      userId: decoded.userId,
      meta: { chapterId: decoded.chapterId },
    });

    const state = await getJodyReaderState(decoded.userId);
    let greetingName = user.firstName || user.fname;
    if (!greetingName) {
      greetingName = extractNameFromEmail(decoded.email);
    }

    return res.json({
      ok: true,
      email: decoded.email,
      userId: decoded.userId,
      chapterId: decoded.chapterId,
      greetingName,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      state,
    });
  } catch (err) {
    console.error('[jody/remember/verify]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
