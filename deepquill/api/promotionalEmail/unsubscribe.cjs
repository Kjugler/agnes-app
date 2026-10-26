/**
 * One-step promotional unsubscribe. No login. No Mailchimp call. No send.
 * Purchase mail is untouched because this writes only promotional opt-out fields.
 */

const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { applyPromotionalPreference } = require('../../lib/readers/promotionalConsent.cjs');
const { verifyPromotionalUnsubscribeToken } = require('../../lib/readers/promotionalUnsubscribeToken.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');

async function unsubscribeByEmail(req, res, db) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ ok: false, error: 'invalid_email' });
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (user) {
    const result = await applyPromotionalPreference(db, {
      userId: user.id,
      action: 'opt_out',
      source: 'unsubscribe_by_email',
      explicit: true,
    });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
  }
  return res.json({ ok: true, promotionalEmail: 'off' });
}

module.exports = async function promotionalUnsubscribeHandler(req, res, deps = {}) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ ok: true, promotionalEmail: 'unchanged', changed: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const token = verifyPromotionalUnsubscribeToken(req.body?.token || req.query?.token);
  if (!token) {
    if (req.body?.confirm === true) {
      try {
        if (!deps.prisma) ensureDatabaseUrl();
        return await unsubscribeByEmail(req, res, deps.prisma || prisma);
      } catch (err) {
        console.error('[promotional-email/unsubscribe] failed');
        return res.status(500).json({ ok: false, error: 'server_error' });
      }
    }
    return res.status(400).json({ ok: false, error: 'invalid_token' });
  }

  try {
    if (!deps.prisma) ensureDatabaseUrl();
    const db = deps.prisma || prisma;
    const user = await db.user.findUnique({
      where: { id: token.userId },
      select: { id: true, email: true },
    });
    if (!user || normalizeEmail(user.email) !== token.email) {
      return res.status(400).json({ ok: false, error: 'identity_mismatch' });
    }
    const result = await applyPromotionalPreference(db, {
      userId: user.id,
      action: 'opt_out',
      source: 'unsubscribe_link',
      explicit: true,
    });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.json({ ok: true, promotionalEmail: 'off', changed: result.changed });
  } catch (err) {
    console.error('[promotional-email/unsubscribe] failed');
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
