// POST /api/readers-agree/lead — persist email, sync ReaderProfile identity, record funnel event, return sample-chapters path.
// No prospect nurture, no welcome email, no nurture enrollment.

const { ensureDatabaseUrl, prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureAssociateMinimal } = require('../contest/login.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');
const {
  buildLeadAttributionSnapshot,
  READERS_CHEER_ENTRY_PAGE,
  resolveCaptureSurface,
  resolveRetailerOrigin,
  syncReadersAgreeLeadProfile,
} = require('../../lib/readers/readersAgreeLead.cjs');
const { signReadersAgreeSession } = require('../../src/lib/readersAgreeSessionToken.cjs');
const {
  normalizeVisitorId,
  readAllowanceToken,
  emailAcceptanceFact,
  serverGateFact,
} = require('../../src/lib/readingAllowance.cjs');
const { recordReadingAllowanceFact } = require('../../lib/readers/recordReadingAllowanceFact.cjs');
const { applyPromotionalPreference } = require('../../lib/readers/promotionalConsent.cjs');
const { planJodyReadingAccessOptIn } = require('../../lib/readers/jodyReadingAccessOptIn.cjs');
const { independentDncActive } = require('../../lib/readers/readerContactSuppression.cjs');

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

/**
 * Access rule: a valid email always resolves to one User.
 * Create if missing; reuse if present. Identity-update failures must not
 * block access when the User row already exists.
 */
async function resolveLeadUser(email) {
  try {
    const user = await ensureAssociateMinimal(email);
    if (user?.id) return user;
  } catch (err) {
    console.warn('[readers-agree/lead] ensureAssociateMinimal failed; trying existing identity', {
      code: err && err.code,
      message: err && err.message,
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  return existing?.id ? existing : null;
}

async function recordJodyPromotionalOptIn(userId) {
  const [profile, decisions] = await Promise.all([
    prisma.readerProfile.findUnique({ where: { userId } }),
    prisma.readerContactDecision.findMany({
      where: { userId },
      select: { id: true, decision: true, origin: true, createdAt: true },
    }),
  ]);
  const plan = planJodyReadingAccessOptIn({
    profile,
    doNotContact: independentDncActive(decisions),
    archived: Boolean(profile && profile.status === 'archived'),
    explicit: true,
    accept: true,
  });
  if (!plan.write) {
    return plan.error === 'already_active' ? 'unchanged' : 'not_recorded';
  }
  const result = await applyPromotionalPreference(prisma, {
    userId,
    action: plan.action,
    source: plan.source,
    explicit: true,
  });
  if (!result.ok) return 'not_recorded';
  return result.changed ? 'recorded' : 'unchanged';
}

async function attachAnonymousVisitorEvents(userId, visitorId) {
  const vid = normalizeVisitorId(visitorId);
  if (!vid || !userId) return;
  await prisma.$executeRaw`
    UPDATE "Event"
    SET "userId" = ${userId}
    WHERE "userId" IS NULL
      AND json_extract("meta", '$.visitorId') = ${vid}
  `;
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
    const user = await resolveLeadUser(email);
    if (!user?.id) {
      return res.status(500).json({ ok: false, error: 'user_create_failed' });
    }

    const redirectPath = buildRedirectPath({ ref, code, utm });
    const captureSurface = resolveCaptureSurface(body.captureSurface);
    const retailerOrigin = resolveRetailerOrigin(body.retailerOrigin);
    const attribution = buildLeadAttributionSnapshot({
      visitorId,
      ref,
      code,
      utm: utm && typeof utm === 'object' ? utm : {},
      captureSurface,
      retailerOrigin,
    });

    try {
      await syncReadersAgreeLeadProfile(prisma, user.id, {
        attribution,
        consentAccepted: body.consentAccepted === true,
      });
    } catch (profileErr) {
      console.warn('[readers-agree/lead] profile sync failed', profileErr && profileErr.message);
    }

    // Observability only — raw POST count, not a genuine-visit signal.
    let priorEmailSubmitCount = 0;
    try {
      priorEmailSubmitCount = await prisma.event.count({
        where: { userId: user.id, type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED },
      });
    } catch (countErr) {
      console.warn('[readers-agree/lead] prior submit count failed', countErr && countErr.message);
    }

    try {
      const eventMeta = {
        captureSurface,
        retailerOrigin,
        destination: 'sample-chapters',
        visitorId: visitorId || null,
        ref: ref || null,
        priorEmailSubmitCount,
      };
      if (captureSurface === 'cheer') eventMeta.entryPage = READERS_CHEER_ENTRY_PAGE;
      await recordServerFunnelEvent(prisma, {
        type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
        userId: user.id,
        meta: eventMeta,
      });
    } catch (eventErr) {
      console.warn('[readers-agree/lead] event record failed', eventErr && eventErr.message);
    }

    const allowanceHeader = req.headers['x-reading-allowance'];
    const allowanceToken = typeof allowanceHeader === 'string' ? allowanceHeader.trim() : '';
    const allowance = allowanceToken ? readAllowanceToken(allowanceToken, Date.now()) : null;
    const claimedVisitorId = normalizeVisitorId(visitorId);
    if (
      allowance &&
      allowance.ok &&
      allowance.state.visitorId &&
      claimedVisitorId &&
      allowance.state.visitorId === claimedVisitorId
    ) {
      const gate = serverGateFact(allowance.state);
      if (gate) {
        try {
          await recordReadingAllowanceFact(prisma, gate, user.id);
        } catch (gateErr) {
          console.warn('[readers-agree/lead] gate record failed', gateErr && gateErr.message);
        }
      }
      const acceptance = emailAcceptanceFact(allowance.state);
      if (acceptance) {
        try {
          await recordReadingAllowanceFact(prisma, acceptance, user.id);
        } catch (acceptErr) {
          console.warn('[readers-agree/lead] gate acceptance record failed', acceptErr && acceptErr.message);
        }
      }
      try {
        await attachAnonymousVisitorEvents(user.id, claimedVisitorId);
      } catch (attachErr) {
        console.warn('[readers-agree/lead] visitor event attach failed', attachErr && attachErr.message);
      }
    }

    // Only the current Next proxy sends this header. The previous proxy returned
    // the JSON body unchanged, so a token must not be present unless it was requested.
    const issueHeader = req.headers['x-readers-agree-issue-session'];
    const issueSession = issueHeader === '1';
    let sessionToken = null;
    if (issueSession) {
      try {
        sessionToken = signReadersAgreeSession(user.id);
      } catch (tokenErr) {
        console.warn('[readers-agree/lead] session token not issued', tokenErr && tokenErr.message);
      }
    }

    let promotionalConsent = 'not_requested';
    if (body.promotionalOptIn === true) {
      try {
        promotionalConsent = await recordJodyPromotionalOptIn(user.id);
      } catch (consentErr) {
        console.warn('[readers-agree/lead] promotional consent not saved', consentErr && consentErr.message);
        promotionalConsent = 'not_recorded';
      }
    }

    const responseBody = {
      ok: true,
      email,
      userId: user.id,
      redirectPath,
      promotionalConsent,
    };
    if (sessionToken) responseBody.sessionToken = sessionToken;
    return res.json(responseBody);
  } catch (err) {
    console.error('[readers-agree/lead]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

module.exports.buildRedirectPath = buildRedirectPath;
module.exports.resolveCaptureSurface = resolveCaptureSurface;
module.exports.resolveRetailerOrigin = resolveRetailerOrigin;
