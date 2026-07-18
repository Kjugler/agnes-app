// GET /api/jody/chapter/continue?token=
// Validates delivery token for Continue Reading page.

const { verifyRememberPlaceToken } = require('../../src/lib/rememberPlaceToken.cjs');
const { prisma } = require('../../server/prisma.cjs');
const { getJodyReaderState } = require('../../lib/readers/jodyReaderState.cjs');

module.exports = async function jodyChapterContinueHandler(req, res) {
  try {
    const token = req.query?.token;
    const payload = verifyRememberPlaceToken(typeof token === 'string' ? token : '');
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid_token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true },
    });
    if (!user || user.email?.toLowerCase() !== payload.email.toLowerCase()) {
      return res.status(400).json({ ok: false, error: 'invalid_token' });
    }

    const state = await getJodyReaderState(payload.userId);

    return res.json({
      ok: true,
      email: payload.email,
      chapterId: payload.chapterId,
      greetingName: state.greetingName,
    });
  } catch (err) {
    console.error('[jody/chapter/continue]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
