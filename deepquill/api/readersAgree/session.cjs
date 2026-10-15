// GET /api/readers-agree/session
// Header: x-readers-agree-session (signed token). Raw user ids are not sessions.
// Read-only. Does not enroll nurture, send mail, or modify ReaderProfile.

const { ensureDatabaseUrl, prisma } = require('../../server/prisma.cjs');
const {
  verifyReadersAgreeSession,
  maskEmailForRecognition,
} = require('../../src/lib/readersAgreeSessionToken.cjs');

function unrecognized() {
  return { ok: true, recognized: false };
}

module.exports = async function readersAgreeSessionHandler(req, res) {
  try {
    const header = req.headers['x-readers-agree-session'];
    const token = typeof header === 'string' ? header.trim() : '';
    const verified = verifyReadersAgreeSession(token);
    if (!verified) {
      return res.json(unrecognized());
    }

    ensureDatabaseUrl();
    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true },
    });
    const emailHint = user ? maskEmailForRecognition(user.email) : null;
    if (!user?.id || !emailHint) {
      return res.json(unrecognized());
    }

    return res.json({
      ok: true,
      recognized: true,
      emailHint,
    });
  } catch (err) {
    console.error('[readers-agree/session]', err && err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
