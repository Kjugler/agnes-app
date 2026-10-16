/**
 * Departure-bridge promotional opt-in.
 * Does not send mail, change referral ancestry, or grant reading access.
 */

const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { applyPromotionalPreference } = require('../../lib/readers/promotionalConsent.cjs');
const { planDepartureOptIn, departureStatus } = require('../../lib/readers/departureOptIn.cjs');
const { independentDncActive } = require('../../lib/readers/readerContactSuppression.cjs');
const { ensureReaderUser } = require('../../lib/readers/readerUser.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const {
  verifyReadersAgreeSession,
  maskEmailForRecognition,
} = require('../../src/lib/readersAgreeSessionToken.cjs');

function contestUserId(req) {
  const value = req.headers['x-contest-user-id'];
  return typeof value === 'string' ? value.trim() : '';
}

function sessionUserId(req) {
  const token = req.headers['x-readers-agree-session'];
  const verified = verifyReadersAgreeSession(typeof token === 'string' ? token.trim() : '');
  return verified && verified.userId ? String(verified.userId) : '';
}

async function loadReader(userId) {
  const [user, profile, decisions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
    prisma.readerProfile.findUnique({ where: { userId } }),
    prisma.readerContactDecision.findMany({
      where: { userId },
      select: { id: true, decision: true, origin: true, createdAt: true },
    }),
  ]);
  return { user, profile, doNotContact: independentDncActive(decisions) };
}

async function resolveKnownUserId(req) {
  return contestUserId(req) || sessionUserId(req);
}

async function readDeparture(req, res) {
  try {
    ensureDatabaseUrl();
    const userId = await resolveKnownUserId(req);
    if (!userId) {
      return res.json({ ok: true, ...departureStatus({ known: false }) });
    }
    const reader = await loadReader(userId);
    if (!reader.user) return res.json({ ok: true, ...departureStatus({ known: false }) });
    const status = departureStatus({
      known: true,
      profile: reader.profile,
      doNotContact: reader.doNotContact,
      archived: reader.profile && reader.profile.status === 'archived',
    });
    return res.json({
      ok: true,
      ...status,
      emailHint: maskEmailForRecognition(reader.user.email),
    });
  } catch (err) {
    console.error('[promotional-email/departure] read failed');
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

async function writeDeparture(req, res) {
  const explicit = req.body?.explicit === true;
  const accept = req.body?.accept === true;
  if (!explicit || !accept) {
    return res.status(400).json({ ok: false, error: 'explicit_confirmation_required' });
  }
  try {
    ensureDatabaseUrl();
    let userId = await resolveKnownUserId(req);
    let reader = userId ? await loadReader(userId) : null;
    if (!reader || !reader.user) {
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ ok: false, error: 'email_required' });
      const ensured = await ensureReaderUser(prisma, email);
      userId = ensured.user.id;
      reader = await loadReader(userId);
    }
    if (!reader.user) return res.status(400).json({ ok: false, error: 'reader_not_found' });
    const plan = planDepartureOptIn({
      profile: reader.profile,
      doNotContact: reader.doNotContact,
      archived: reader.profile && reader.profile.status === 'archived',
      explicit,
      accept,
    });
    if (!plan.write) return res.status(400).json({ ok: false, error: plan.error });
    const result = await applyPromotionalPreference(prisma, {
      userId,
      action: plan.action,
      source: plan.source,
      explicit: true,
    });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.json({ ok: true, changed: result.changed, state: result.state });
  } catch (err) {
    console.error('[promotional-email/departure] write failed');
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

module.exports = async function promotionalDepartureHandler(req, res) {
  if (req.method === 'GET') return readDeparture(req, res);
  if (req.method === 'POST') return writeDeparture(req, res);
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
};
