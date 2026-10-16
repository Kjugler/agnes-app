/**
 * Explicit promotional-email preference for an identified reader.
 * Does not call Mailchimp and does not send email.
 */

const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { applyPromotionalPreference, promotionalConsentState } = require('../../lib/readers/promotionalConsent.cjs');

function readerId(req) {
  const value = req.headers['x-contest-user-id'];
  return typeof value === 'string' ? value.trim() : '';
}

async function readConsent(req, res) {
  const userId = readerId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    ensureDatabaseUrl();
    const profile = await prisma.readerProfile.findUnique({ where: { userId } });
    return res.json({ ok: true, state: promotionalConsentState(profile) });
  } catch (err) {
    console.error('[promotional-email/consent] read failed');
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function writeConsent(req, res) {
  const userId = readerId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const action = req.body?.action === 'opt_out' ? 'opt_out' : req.body?.action === 'opt_in' ? 'opt_in' : null;
  if (!action) return res.status(400).json({ ok: false, error: 'explicit_confirmation_required' });
  try {
    ensureDatabaseUrl();
    const result = await applyPromotionalPreference(prisma, {
      userId,
      action,
      source: 'reader_preferences',
      explicit: req.body?.explicit === true,
    });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.json({ ok: true, changed: result.changed, state: result.state });
  } catch (err) {
    console.error('[promotional-email/consent] write failed');
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

module.exports = async function promotionalConsentHandler(req, res) {
  if (req.method === 'GET') return readConsent(req, res);
  if (req.method === 'POST') return writeConsent(req, res);
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
};
