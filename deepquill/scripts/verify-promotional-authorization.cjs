/**
 * Central promotional authorization. No network or email send.
 * Usage: node scripts/verify-promotional-authorization.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.FULFILLMENT_TOKEN_SECRET = 'local-promotional-authorization-secret';

const { authorizePromotionalNurture, TREATMENT } = require('../lib/readers/authorizePromotionalNurture.cjs');
const {
  buildPromotionalUnsubscribeUrl,
  verifyPromotionalUnsubscribeToken,
} = require('../lib/readers/promotionalUnsubscribeToken.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');

const CLEAR = { checked: true, suppressed: false, reason: null, providerReason: null };
const SPAM = { checked: true, suppressed: true, reason: 'complaint', providerReason: 'spam' };
const BOUNCE = { checked: true, suppressed: true, reason: 'provider_reject', providerReason: 'hard-bounce' };
const FAILED = { checked: false, suppressed: true, reason: 'provider_check_failed', providerReason: 'rejects_list_failed' };

function store(seed) {
  const data = {
    user: seed.user,
    profile: seed.profile || null,
    purchases: seed.purchases || [],
    evidence: seed.evidence || [],
    decisions: seed.decisions || [],
    communications: seed.communications || [],
    review: seed.review || null,
    events: seed.events || [],
  };
  return {
    data,
    user: { findUnique: async () => data.user },
    readerProfile: { findUnique: async () => data.profile },
    purchase: { findMany: async () => data.purchases },
    readerEvidence: { findMany: async () => data.evidence },
    readerContactDecision: { findMany: async () => data.decisions },
    readerCommunication: { findMany: async () => data.communications },
    review: { findFirst: async () => data.review },
    event: { findMany: async () => data.events },
  };
}

function purchaser(extra = {}) {
  return store({
    user: {
      id: 'u1',
      email: extra.email || 'ada@readers.net',
      code: 'ADA123',
      referralCode: 'ADA123',
    },
    profile: {
      userId: 'u1',
      status: extra.status || 'active',
      readerType: 'purchased',
      emailMarketingConsentAt: extra.consentAt === undefined ? '2026-09-02T16:00:00.000Z' : extra.consentAt,
      emailMarketingConsentSource: extra.consentAt ? 'reader_preferences' : null,
      emailMarketingOptOutAt: extra.optOutAt || null,
      leadAttribution: null,
      ...extra.profile,
    },
    purchases: extra.purchases === undefined ? [{
      userId: 'u1',
      sessionId: 'cs_live_auth',
      saleStatus: 'live',
      createdAt: '2026-09-01T16:00:00.000Z',
    }] : extra.purchases,
    decisions: extra.decisions || [],
    communications: extra.communications || [],
    events: extra.events || [],
  });
}

function checkWith(result) {
  return async () => result;
}

async function main() {
  const due = await authorizePromotionalNurture(
    purchaser(),
    {
      userId: 'u1',
      treatment: TREATMENT.TEXT_A_FRIEND,
      now: '2026-10-15T16:00:00.000Z',
      providerSuppression: CLEAR,
    },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(due.authorized, true);
  assert.equal(due.send, false);
  assert.equal(due.reason, 'authorized');
  assert.equal(due.treatment, TREATMENT.TEXT_A_FRIEND);
  assert.match(due.unsubscribeUrl, /\/preferences\/unsubscribe\?token=/);
  const token = new URL(due.unsubscribeUrl).searchParams.get('token');
  assert.equal(verifyPromotionalUnsubscribeToken(token).email, 'ada@readers.net');

  const ignoredClear = await authorizePromotionalNurture(
    purchaser(),
    {
      userId: 'u1',
      treatment: TREATMENT.TEXT_A_FRIEND,
      now: '2026-10-15T16:00:00.000Z',
      providerSuppression: CLEAR,
    },
    { checkTransactionalSuppression: checkWith(SPAM) },
  );
  assert.equal(ignoredClear.authorized, false);
  assert.equal(ignoredClear.reason, 'complaint');
  assert.equal(ignoredClear.send, false);

  const noConsent = await authorizePromotionalNurture(
    purchaser({ consentAt: null }),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(noConsent.authorized, false);
  assert.equal(noConsent.reason, 'reading_access_email_is_not_marketing_consent');

  const optedOut = await authorizePromotionalNurture(
    purchaser({ optOutAt: '2026-09-20T16:00:00.000Z' }),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(optedOut.authorized, false);
  assert.equal(optedOut.reason, 'promotional_opt_out');

  const dnc = await authorizePromotionalNurture(
    purchaser({
      decisions: [{ id: 'd1', decision: 'suppress', origin: 'admin_manual', createdAt: '2026-09-01T00:00:00.000Z' }],
    }),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(dnc.authorized, false);
  assert.equal(dnc.reason, 'do_not_contact');

  const archived = await authorizePromotionalNurture(
    purchaser({ status: 'archived' }),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(archived.authorized, false);
  assert.equal(archived.reason, 'archived');

  const bounce = await authorizePromotionalNurture(
    purchaser(),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(BOUNCE) },
  );
  assert.equal(bounce.authorized, false);
  assert.equal(bounce.reason, 'hard_bounce');

  const lookupFailed = await authorizePromotionalNurture(
    purchaser(),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(FAILED) },
  );
  assert.equal(lookupFailed.authorized, false);
  assert.equal(lookupFailed.reason, 'provider_check_failed');

  const early = await authorizePromotionalNurture(
    purchaser(),
    { userId: 'u1', treatment: TREATMENT.TEXT_A_FRIEND, now: '2026-09-05T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(early.authorized, false);
  assert.equal(early.reason, 'scheduled_time_not_reached');
  assert.equal(early.treatment, TREATMENT.TEXT_A_FRIEND);

  const wrong = await authorizePromotionalNurture(
    purchaser(),
    { userId: 'u1', treatment: TREATMENT.HONEST_REVIEW, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(wrong.authorized, false);
  assert.equal(wrong.reason, 'treatment_not_eligible');

  const prospect = store({
    user: { id: 'p1', email: 'ada@readers.net', code: 'ADA123', referralCode: 'ADA123' },
    profile: {
      userId: 'p1',
      status: 'active',
      readerType: 'prospect',
      emailMarketingConsentAt: '2026-10-02T16:00:00.000Z',
      emailMarketingConsentSource: 'reader_preferences',
      leadAttribution: {
        capturedAt: '2026-10-01T16:00:00.000Z',
        captureSurface: 'landing',
        visitorId: 'vid-auth-1',
        channel: 'unknown',
      },
    },
    events: [{
      id: 'e1',
      userId: 'p1',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
      createdAt: '2026-10-01T16:00:00.000Z',
      meta: { source: 'server' },
    }],
  });
  const prospectDue = await authorizePromotionalNurture(
    prospect,
    { userId: 'p1', treatment: TREATMENT.IDENTIFIED_FOLLOWUP, now: '2026-10-15T16:00:00.000Z' },
    { checkTransactionalSuppression: checkWith(CLEAR) },
  );
  assert.equal(prospectDue.authorized, true);
  assert.equal(prospectDue.send, false);
  assert.equal(prospectDue.treatment, TREATMENT.IDENTIFIED_FOLLOWUP);

  const url = buildPromotionalUnsubscribeUrl({
    userId: 'u1',
    email: 'Ada@Readers.net',
    siteUrl: 'https://www.theagnesprotocol.com',
  });
  const parsed = verifyPromotionalUnsubscribeToken(new URL(url).searchParams.get('token'));
  assert.equal(parsed.userId, 'u1');
  assert.equal(parsed.email, 'ada@readers.net');
  assert.match(url, /^https:\/\/www\.theagnesprotocol\.com\/preferences\/unsubscribe\?token=/);

  const root = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const bypass = [
    'lib/email/sendEmail.cjs',
    'lib/email/runReaderRecommendationOutreach.cjs',
    'lib/email/adminEmailSend.cjs',
    'scripts/send-quiet-reveal-email.cjs',
    'lib/email/shippingConfirmation.cjs',
    'lib/email/resendPurchaseEmails.cjs',
    'api/stripe-webhook.cjs',
  ];
  for (const rel of bypass) {
    assert.doesNotMatch(read(rel), /authorizePromotionalNurture/);
  }
  assert.match(read('lib/readers/readerOutreachEligibility.cjs'), /authorizePromotionalNurture/);
  assert.doesNotMatch(read('lib/email/sendEmail.cjs'), /checkTransactionalSuppression/);

  console.log('verify-promotional-authorization: passed');
  console.log('unchanged bypass paths:');
  for (const rel of bypass) console.log(`  ${rel}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
