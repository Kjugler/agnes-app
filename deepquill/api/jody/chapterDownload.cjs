// GET /api/jody/chapter/download?token=
// Validates token and returns PDF path for redirect.

const { verifyRememberPlaceToken } = require('../../src/lib/rememberPlaceToken.cjs');
const { getChapterPdfPath } = require('../../lib/readers/jodyReaderState.cjs');

function siteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://www.theagnesprotocol.com'
  ).replace(/\/$/, '');
}

module.exports = async function jodyChapterDownloadHandler(req, res) {
  try {
    const token = req.query?.token;
    const payload = verifyRememberPlaceToken(typeof token === 'string' ? token : '');
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid_token' });
    }

    const pdfPath = getChapterPdfPath(payload.chapterId);
    if (!pdfPath) {
      return res.status(400).json({ ok: false, error: 'invalid_chapter_id' });
    }

    const redirectUrl = `${siteUrl()}${pdfPath}`;
    return res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('[jody/chapter/download]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
