// POST /api/jody/remember/save
// Header: x-jody-identity-user-id (from Next httpOnly contest or Readers Agree lead cookie)
// Body: { chapterId } — never trust body.userId or analytics UID

const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { prisma } = require('../../server/prisma.cjs');
const {
  saveJodyReadingProgress,
  isValidChapterId,
} = require('../../lib/readers/jodyReaderState.cjs');

module.exports = async function jodyRememberSaveHandler(req, res) {
  try {
    const headerUserId = req.headers['x-jody-identity-user-id'];
    const userId =
      typeof headerUserId === 'string' ? headerUserId.trim().slice(0, 64) : '';
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { chapterId, userId: bodyUserId } = req.body || {};
    if (bodyUserId) {
      return res.status(400).json({ ok: false, error: 'user_id_not_accepted' });
    }
    if (!chapterId || !isValidChapterId(chapterId)) {
      return res.status(400).json({ ok: false, error: 'invalid_chapter_id' });
    }

    ensureDatabaseUrl();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    await saveJodyReadingProgress({
      userId: user.id,
      chapterId: String(chapterId),
    });

    return res.json({ ok: true, chapterId: String(chapterId) });
  } catch (err) {
    console.error('[jody/remember/save]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
