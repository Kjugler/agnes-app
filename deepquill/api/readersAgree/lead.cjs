// POST /api/readers-agree/lead — persist email, record funnel event, return sample-chapters path.
// No prospect nurture, no welcome email, no ReaderProfile writes.

const { ensureDatabaseUrl, prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureAssociateMinimal } = require('../contest/login.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');

const REDIRECT_PARAM_KEYS = [
  'ref',
  'code',
  'src',
  'v',
  'origin',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'fbclid',
];

function buildRedirectPath({ ref, code, utm }) {
  const params = new URLSearchParams();
  const source = utm && typeof utm === 'object' ? utm : {};
  const values = {
    ref: ref || source.ref || null,
    code: code || source.code || null,
    src: source.src || null,
    v: source.v || null,
    origin: source.origin || null,
    utm_source: source.utm_source || null,
    utm_medium: source.utm_medium || null,
    utm_campaign: source.utm_campaign || null,
    fbclid: source.fbclid || null,
  };
  for (const key of REDIRECT_PARAM_KEYS) {
    const value = values[key];
    if (value) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/sample-chapters?${qs}` : '/sample-chapters';
}

module.exports = async function readersAgreeLeadHandler(req, res) {
  try {
    const body = req.body || {};
    const { email: emailRaw, visitorId, ref, code, utm } = body;

    if (!emailRaw || typeof emailRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'email_required' });
    }

    const email = normalizeEmail(emailRaw);
    if (!email) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    ensureDatabaseUrl();
    const user = await ensureAssociateMinimal(email);
    if (!user?.id) {
      return res.status(500).json({ ok: false, error: 'user_create_failed' });
    }

    const redirectPath = buildRedirectPath({ ref, code, utm });

    await recordServerFunnelEvent(prisma, {
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
      userId: user.id,
      meta: {
        captureSurface: 'landing',
        destination: 'sample-chapters',
        visitorId: visitorId || null,
        ref: ref || null,
      },
    });

    return res.json({
      ok: true,
      email,
      userId: user.id,
      redirectPath,
    });
  } catch (err) {
    console.error('[readers-agree/lead]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

module.exports.buildRedirectPath = buildRedirectPath;
