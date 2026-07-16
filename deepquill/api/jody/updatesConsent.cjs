// POST /api/jody/updates-consent
// Body: { accept: boolean }

const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { saveJodyUpdatesConsent } = require('../../lib/readers/jodyReaderState.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');

module.exports = async function jodyUpdatesConsentHandler(req, res) {
  const userId = req.headers['x-contest-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const accept = req.body?.accept === true;

  try {
    ensureDatabaseUrl();
    await saveJodyUpdatesConsent({ userId: userId.trim(), accept });
    if (accept) {
      await recordServerFunnelEvent(prisma, {
        type: FUNNEL_EVENT_TYPES.JODY_UPDATES_ACCEPT,
        userId: userId.trim(),
        meta: { source: 'server' },
      });
    }
    return res.json({ ok: true, accept });
  } catch (err) {
    console.error('[jody/updates-consent]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
