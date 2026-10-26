/**
 * Local permission, unsubscribe, provider suppression, and personal-code checks.
 * No database, network, email, or Mailchimp call.
 * Usage: node scripts/verify-promotional-permission.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.FULFILLMENT_TOKEN_SECRET = 'local-promotional-permission-secret-32';
process.env.PROMOTIONAL_UNSUBSCRIBE_SECRET = 'local-promotional-unsubscribe-secret';

const {
  planPromotionalPreference,
  applyPromotionalPreference,
  promotionalConsentState,
} = require('../lib/readers/promotionalConsent.cjs');
const {
  signPromotionalUnsubscribeToken,
  verifyPromotionalUnsubscribeToken,
} = require('../lib/readers/promotionalUnsubscribeToken.cjs');
const { checkTransactionalSuppression } = require('../lib/email/transactionalSuppression.cjs');
const { backfillUserCodes } = require('../lib/readers/readerUser.cjs');
const { decideReaderNurture, DECISION } = require('../lib/readers/nurtureDecision.cjs');

const NOW = new Date('2026-10-15T16:00:00.000Z');
const LATER = new Date('2026-10-20T16:00:00.000Z');

function memoryProfile(initial) {
  const state = {
    profile: initial ? { ...initial } : null,
    purchases: [{ sessionId: 'cs_live_purchaser', saleStatus: 'live' }],
  };
  return {
    state,
    readerProfile: {
      async findUnique() {
        return state.profile;
      },
      async create({ data }) {
        assert.equal(data.emailUpdatesConsent, undefined);
        assert.equal(data.readerType, undefined);
        state.profile = { id: 'p1', ...data };
        return state.profile;
      },
      async update({ data }) {
        const allowed = [
          'emailMarketingConsentAt',
          'emailMarketingConsentSource',
          'emailMarketingOptOutAt',
          'emailMarketingOptOutSource',
        ];
        for (const key of Object.keys(data)) assert.ok(allowed.includes(key), key);
        state.profile = { ...state.profile, ...data };
        return state.profile;
      },
    },
  };
}

function purchaserInput(extra = {}) {
  return {
    readerRef: 'purchaser-permission',
    email: 'ada@readers.net',
    now: NOW.toISOString(),
    confirmedPurchaseAt: '2026-09-01T16:00:00.000Z',
    ownReferralCode: 'ADA123',
    purchases: [{ sessionId: 'cs_live_perm', saleStatus: 'live', purchasedAt: '2026-09-01' }],
    ...extra,
  };
}

async function main() {
  const declined = planPromotionalPreference(null, {
    action: 'opt_in',
    source: 'reader_preferences',
    explicit: false,
    now: NOW,
  });
  assert.equal(declined.write, false);
  assert.equal(declined.error, 'explicit_confirmation_required');

  const prisma = memoryProfile(null);
  const accepted = await applyPromotionalPreference(prisma, {
    userId: 'u-purchaser',
    action: 'opt_in',
    source: 'reader_preferences',
    explicit: true,
    now: NOW,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.changed, true);
  assert.equal(accepted.state.active, true);
  assert.equal(accepted.state.consentAt, NOW.toISOString());
  assert.equal(accepted.state.consentSource, 'reader_preferences');
  assert.equal(prisma.state.profile.readerType, undefined);
  assert.equal(prisma.state.purchases.length, 1);

  const duplicate = await applyPromotionalPreference(prisma, {
    userId: 'u-purchaser',
    action: 'opt_in',
    source: 'reader_preferences',
    explicit: true,
    now: LATER,
  });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state.consentAt, NOW.toISOString());

  const inferred = planPromotionalPreference(prisma.state.profile, {
    action: 'opt_in',
    source: 'mailchimp_audience',
    explicit: true,
    now: LATER,
  });
  assert.equal(inferred.write, false);
  assert.equal(inferred.error, 'unsupported_source');

  const optedOut = await applyPromotionalPreference(prisma, {
    userId: 'u-purchaser',
    action: 'opt_out',
    source: 'unsubscribe_link',
    explicit: true,
    now: LATER,
  });
  assert.equal(optedOut.state.active, false);
  assert.equal(optedOut.state.optOutAt, LATER.toISOString());
  assert.equal(optedOut.state.consentAt, NOW.toISOString());

  const repeatOut = await applyPromotionalPreference(prisma, {
    userId: 'u-purchaser',
    action: 'opt_out',
    source: 'unsubscribe_link',
    explicit: true,
    now: new Date('2026-11-01T16:00:00.000Z'),
  });
  assert.equal(repeatOut.changed, false);
  assert.equal(repeatOut.state.optOutAt, LATER.toISOString());

  const revisit = planPromotionalPreference(prisma.state.profile, {
    action: 'opt_in',
    source: 'reader_preferences',
    explicit: false,
    now: new Date('2026-11-02T16:00:00.000Z'),
  });
  assert.equal(revisit.write, false);
  assert.equal(promotionalConsentState(prisma.state.profile).active, false);

  const again = await applyPromotionalPreference(prisma, {
    userId: 'u-purchaser',
    action: 'opt_in',
    source: 'reader_preferences',
    explicit: true,
    now: new Date('2026-11-02T16:00:00.000Z'),
  });
  assert.equal(again.state.active, true);
  assert.equal(again.state.optOutAt, LATER.toISOString());
  assert.ok(again.state.consentAt > again.state.optOutAt);

  const token = signPromotionalUnsubscribeToken({ userId: 'u-purchaser', email: 'Ada@Readers.net' });
  const verified = verifyPromotionalUnsubscribeToken(token);
  assert.equal(verified.userId, 'u-purchaser');
  assert.equal(verified.email, 'ada@readers.net');
  assert.equal(verifyPromotionalUnsubscribeToken(`${token}x`), null);

  const spam = await checkTransactionalSuppression('ada@readers.net', {
    apiKey: 'test-key',
    client: { rejects: { list: async () => [{ email: 'ada@readers.net', reason: 'spam' }] } },
  });
  assert.equal(spam.checked, true);
  assert.equal(spam.suppressed, true);
  assert.equal(spam.reason, 'complaint');
  assert.equal(spam.providerReason, 'spam');

  const unsub = await checkTransactionalSuppression('ada@readers.net', {
    apiKey: 'test-key',
    client: { rejects: { list: async () => [{ email: 'ada@readers.net', reason: 'unsub' }] } },
  });
  assert.equal(unsub.reason, 'provider_unsubscribe');

  const bounce = await checkTransactionalSuppression('ada@readers.net', {
    apiKey: 'test-key',
    client: { rejects: { list: async () => [{ email: 'ada@readers.net', reason: 'hard-bounce' }] } },
  });
  assert.equal(bounce.reason, 'provider_reject');
  assert.equal(bounce.providerReason, 'hard-bounce');

  const failed = await checkTransactionalSuppression('ada@readers.net', {
    apiKey: 'test-key',
    client: { rejects: { list: async () => { throw new Error('down'); } } },
  });
  assert.equal(failed.checked, false);
  assert.equal(failed.suppressed, true);
  assert.equal(failed.reason, 'provider_check_failed');

  const missingKey = await checkTransactionalSuppression('ada@readers.net', { apiKey: '' });
  assert.equal(missingKey.checked, false);
  assert.equal(missingKey.suppressed, true);

  const clear = await checkTransactionalSuppression('ada@readers.net', {
    apiKey: 'test-key',
    client: { rejects: { list: async () => [] } },
  });
  assert.deepEqual(clear, { checked: true, suppressed: false, reason: null, providerReason: null });

  const noConsent = decideReaderNurture(purchaserInput({ providerSuppression: clear }));
  assert.equal(noConsent.canSendPromotional, false);
  assert.equal(noConsent.sendsEmail, false);
  assert.equal(noConsent.reason, 'reading_access_email_is_not_marketing_consent');

  const ready = decideReaderNurture(purchaserInput({
    emailMarketingConsentAt: '2026-09-02T16:00:00.000Z',
    emailMarketingConsentSource: 'reader_preferences',
    providerSuppression: clear,
  }));
  assert.equal(ready.finalDecision, DECISION.HOLD);
  assert.equal(ready.reason, 'sending_not_enabled');
  assert.equal(ready.canSendPromotional, true);
  assert.equal(ready.sendsEmail, false);
  assert.equal(ready.schedulesSend, false);

  const complained = decideReaderNurture(purchaserInput({
    emailMarketingConsentAt: '2026-09-02T16:00:00.000Z',
    emailMarketingConsentSource: 'reader_preferences',
    providerSuppression: spam,
  }));
  assert.equal(complained.finalDecision, DECISION.SUPPRESSED);
  assert.equal(complained.reason, 'complaint');
  assert.equal(complained.canSendPromotional, false);
  assert.equal(complained.providerReason, 'spam');

  const unchecked = decideReaderNurture(purchaserInput({
    emailMarketingConsentAt: '2026-09-02T16:00:00.000Z',
    emailMarketingConsentSource: 'reader_preferences',
    providerSuppression: failed,
  }));
  assert.equal(unchecked.reason, 'provider_check_required');
  assert.equal(unchecked.canSendPromotional, false);

  const opted = decideReaderNurture(purchaserInput({
    emailMarketingConsentAt: '2026-09-02T16:00:00.000Z',
    emailMarketingConsentSource: 'reader_preferences',
    emailMarketingOptOutAt: '2026-09-03T16:00:00.000Z',
    providerSuppression: clear,
  }));
  assert.equal(opted.finalDecision, DECISION.SUPPRESSED);
  assert.equal(opted.reason, 'promotional_opt_out');
  assert.equal(opted.canSendPromotional, false);

  const user = {
    id: 'u1',
    code: 'KEEP12',
    referralCode: '',
    referredBy: 'FRIEND9',
    lastReferralCode: 'FRIEND9',
    referralEarningsCents: 200,
    preferredDiscountCode: 'FRIEND9',
  };
  const codePrisma = {
    user: {
      async findFirst() {
        return null;
      },
      async update({ data }) {
        assert.deepEqual(Object.keys(data).sort(), ['code', 'referralCode']);
        Object.assign(user, data);
        return user;
      },
    },
  };
  const filled = await backfillUserCodes(codePrisma, user);
  assert.equal(filled.code, 'KEEP12');
  assert.equal(filled.referralCode, 'KEEP12');
  assert.equal(filled.referredBy, 'FRIEND9');
  assert.equal(filled.lastReferralCode, 'FRIEND9');
  assert.equal(filled.referralEarningsCents, 200);
  assert.equal(filled.preferredDiscountCode, 'FRIEND9');

  const clashUser = { id: 'u2', code: '', referralCode: 'TAKEN1', referredBy: null };
  let updated = false;
  const clashPrisma = {
    user: {
      async findFirst() {
        return { id: 'other' };
      },
      async update() {
        updated = true;
        return clashUser;
      },
    },
  };
  const unchanged = await backfillUserCodes(clashPrisma, clashUser);
  assert.equal(updated, false);
  assert.equal(unchanged.code, '');
  assert.equal(unchanged.referralCode, 'TAKEN1');

  const empty = { id: 'u3', code: '', referralCode: '' };
  const emptyPrisma = {
    user: {
      async findFirst() {
        return null;
      },
      async update({ data }) {
        assert.equal(data.code, data.referralCode);
        assert.ok(data.code);
        Object.assign(empty, data);
        return empty;
      },
    },
  };
  const generated = await backfillUserCodes(emptyPrisma, empty);
  assert.equal(generated.code, generated.referralCode);
  assert.ok(generated.code);

  const root = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(read('lib/readers/readersAgreeLead.cjs'), /emailMarketingConsentAt/);
  assert.doesNotMatch(read('lib/readers/jodyReaderState.cjs'), /emailMarketingConsent/);
  assert.doesNotMatch(read('api/promotionalEmail/consent.cjs'), /transactionalSuppression|sendEmail|mailchimp/);
  assert.doesNotMatch(read('lib/readers/nurtureDecision.cjs'), /checkTransactionalSuppression|backfillUserCodes/);
  for (const rel of [
    'api/contest/login.cjs',
    'api/points/award.cjs',
    'api/associate/upsert.cjs',
    'lib/webhook/guestStripeBuyer.cjs',
  ]) {
    assert.doesNotMatch(read(rel), /user\.referralCode \|\| code/);
    assert.match(read(rel), /backfillUserCodes/);
  }
  const preferences = fs.readFileSync(
    path.join(root, '../agnes-next/src/app/preferences/PreferencesClient.tsx'),
    'utf8',
  );
  assert.match(preferences, /checked=\{false\}|useState\(false\)/);
  assert.doesNotMatch(preferences, /mailchimp|readingAllowance/);

  console.log('verify-promotional-permission: passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
