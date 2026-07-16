// GET /api/jody/state — requires x-contest-user-id header (set by agnes-next proxy from cookie)

const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { getJodyReaderState } = require('../../lib/readers/jodyReaderState.cjs');

module.exports = async function jodyStateHandler(req, res) {
  const userId = req.headers['x-contest-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    ensureDatabaseUrl();
    const state = await getJodyReaderState(userId.trim());
    if (!state) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    return res.json({ ok: true, state });
  } catch (err) {
    console.error('[jody/state]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
