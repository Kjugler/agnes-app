/**
 * Isolated promotional safety checks. No network, production data, or real email.
 * Usage: node scripts/verify-promotional-safety.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

delete process.env.NURTURE_PROMOTIONAL_SENDING;
delete process.env.PROMOTIONAL_SENDING_ENABLED;
delete process.env.PROMOTIONAL_POSTAL_ADDRESS;
delete process.env.PROMOTIONAL_EXCLUDED_EMAILS;
process.env.FULFILLMENT_TOKEN_SECRET = 'local-promotional-safety-secret-32';
process.env.PROMOTIONAL_UNSUBSCRIBE_SECRET = 'local-promotional-unsubscribe-secret';
delete process.env.PROMOTIONAL_SENDING_ENABLED;
delete process.env.NURTURE_PROMOTIONAL_SENDING;

const { promotionalConsentState, applyPromotionalPreference } = require('../lib/readers/promotionalConsent.cjs');
const { lookupPromotionalConsent } = require('../lib/readers/lookupPromotionalConsent.cjs');
const { masterPromotionalSendingEnabled } = require('../lib/readers/promotionalActivation.cjs');
const { runPromotionalNurture } = require('../lib/readers/runPromotionalNurture.cjs');
const { deliverLegacyPromotional } = require('../lib/readers/deliverLegacyPromotional.cjs');
const promotionalUnsubscribeHandler = require('../api/promotionalEmail/unsubscribe.cjs');
const {
  signPromotionalUnsubscribeToken,
  verifyPromotionalUnsubscribeToken,
} = require('../lib/readers/promotionalUnsubscribeToken.cjs');

const POSTAL = '100 Test Street, Test City, TS 00000';
const root = path.join(__dirname, '..');
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    });
}

function matchesClaim(row, where) {
  if (!where) return true;
  if (where.source && row.source !== where.source) return false;
  if (where.sourceRef && row.sourceRef !== where.sourceRef) return false;
  if (where.userId && row.userId !== where.userId) return false;
  if (typeof where.outcome === 'string' && row.outcome !== where.outcome) return false;
  if (where.outcome && Array.isArray(where.outcome.in) && !where.outcome.in.includes(row.outcome)) return false;
  return true;
}

function memoryDb(rows) {
  const communications = [];
  return {
    communications,
    rows,
    readerProfile: {
      async findMany() {
        return rows.filter((row) => row.profile && row.profile.emailMarketingConsentAt).map((row) => ({ userId: row.id }));
      },
      async findUnique({ where }) {
        const row = rows.find((item) => item.id === where.userId);
        return row ? row.profile : null;
      },
      async update({ where, data }) {
        const row = rows.find((item) => item.id === where.userId);
        Object.assign(row.profile, data);
        return row.profile;
      },
    },
    user: {
      async findUnique({ where }) {
        const row = rows.find((item) => item.id === where.id || item.email === where.email);
        if (!row) return null;
        return {
          id: row.id,
          email: row.email,
          referralCode: row.referralCode || null,
          readerProfile: row.profile,
        };
      },
      async update({ where, data }) {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async updateMany({ where, data }) {
        const matches = rows.filter((row) => {
          if (where.id && row.id !== where.id) return false;
          return Object.entries(where).every(([key, value]) => {
            if (key === 'id') return true;
            const current = row[key] === undefined ? null : row[key];
            return current === value;
          });
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      },
    },
    readerCommunication: {
      async findMany() {
        return communications.map((row) => ({
          category: row.category,
          outcome: row.outcome,
          occurredAt: row.occurredAt,
        }));
      },
      async create({ data }) {
        if (communications.some((row) => row.source === data.source && row.sourceRef === data.sourceRef)) {
          const err = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        communications.push({ ...data });
        return data;
      },
      async update({ where, data }) {
        const key = where.source_sourceRef;
        const row = communications.find((item) => item.source === key.source && item.sourceRef === key.sourceRef);
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return row;
      },
      async updateMany({ where, data }) {
        const matches = communications.filter((row) => matchesClaim(row, where));
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      },
    },
  };
}

function reader(id, extra = {}) {
  return {
    id,
    email: extra.email || `${id}@readers.net`,
    referralCode: extra.referralCode === undefined ? 'CODE123' : extra.referralCode,
    profile: {
      userId: id,
      status: 'active',
      emailMarketingConsentAt: extra.consentAt === undefined ? '2026-10-02T00:00:00.000Z' : extra.consentAt,
      emailMarketingConsentSource: extra.source === undefined ? 'reader_preferences' : extra.source,
      emailMarketingOptOutAt: extra.optOutAt || null,
      ...(extra.profile || {}),
    },
  };
}

function authOk(treatment = 'identified_followup', category = 'prospect_nurture') {
  return {
    authorized: true,
    treatment,
    category,
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  };
}

function gates(extra = {}) {
  return { sendingEnabled: true, masterEnabled: true, ...extra };
}

function jsonRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function main() {
  await check('1 consent source missing is blocked and the record is not rewritten', async () => {
    const row = reader('legacy', { source: null });
    let writes = 0;
    const db = memoryDb([row]);
    db.readerProfile.update = async () => {
      writes += 1;
      throw new Error('should not write');
    };
    const result = await lookupPromotionalConsent(db, { userId: 'legacy' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'consent_source_missing');
    assert.equal(writes, 0);
    assert.equal(promotionalConsentState(row.profile).active, false);
  });

  await check('2 valid explicit consent can authorize', async () => {
    const result = await lookupPromotionalConsent(memoryDb([reader('ok')]), { userId: 'ok' });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'explicit_consent');
  });

  await check('3 opt-out after consent is blocked', async () => {
    const result = await lookupPromotionalConsent(memoryDb([
      reader('out', { optOutAt: '2026-10-03T00:00:00.000Z' }),
    ]), { userId: 'out' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'promotional_opt_out');
  });

  await check('4 explicit preference re-opt-in is allowed and jody cannot revive an opt-out', async () => {
    const row = reader('again', { optOutAt: '2026-10-03T00:00:00.000Z' });
    const db = memoryDb([row]);
    const revived = await applyPromotionalPreference(db, {
      userId: 'again',
      action: 'opt_in',
      source: 'jody-reading-access',
      explicit: true,
      now: new Date('2026-10-04T00:00:00.000Z'),
    });
    assert.equal(revived.ok, false);
    assert.equal(revived.error, 'opt_out_preserved');
    const preferences = await applyPromotionalPreference(db, {
      userId: 'again',
      action: 'opt_in',
      source: 'reader_preferences',
      explicit: true,
      now: new Date('2026-10-05T00:00:00.000Z'),
    });
    assert.equal(preferences.ok, true);
    assert.equal(preferences.state.active, true);
    const lookup = await lookupPromotionalConsent(db, { userId: 'again' });
    assert.equal(lookup.allowed, true);
  });

  await check('5 purchase after prospect eligibility suppresses the claim before send', async () => {
    const db = memoryDb([reader('buyer')]);
    let calls = 0;
    let sends = 0;
    const result = await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => {
        calls += 1;
        return calls === 1 ? authOk() : { authorized: false, treatment: 'none', reason: 'purchase_confirmed' };
      },
      send() {
        sends += 1;
      },
    });
    assert.equal(result.sent, 0);
    assert.equal(sends, 0);
    assert.equal(db.communications.length, 1);
    assert.equal(db.communications[0].outcome, 'suppressed_before_send');
  });

  await check('6 unsubscribe after claim and before provider submission is blocked', async () => {
    const db = memoryDb([reader('stop')]);
    let calls = 0;
    let sends = 0;
    await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => {
        calls += 1;
        return calls === 1 ? authOk() : { authorized: false, treatment: 'none', reason: 'promotional_opt_out' };
      },
      send() {
        sends += 1;
      },
    });
    assert.equal(sends, 0);
    assert.equal(db.communications[0].outcome, 'suppressed_before_send');
  });

  await check('7 an email change before submission requires a new authorization', async () => {
    const row = reader('moved');
    const db = memoryDb([row]);
    let reads = 0;
    db.user.findUnique = async () => {
      reads += 1;
      return {
        id: row.id,
        email: reads === 1 ? 'first@readers.net' : 'second@readers.net',
        referralCode: 'CODE123',
        readerProfile: row.profile,
      };
    };
    let sends = 0;
    await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        sends += 1;
      },
    });
    assert.equal(sends, 0);
    assert.equal(db.communications[0].outcome, 'suppressed_before_send');
  });

  await check('8 a definite provider failure can be retried once', async () => {
    const db = memoryDb([reader('retry')]);
    let attempts = 0;
    const first = await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        attempts += 1;
        const err = new Error('rejected');
        err.statusCode = 400;
        throw err;
      },
    });
    assert.equal(first.sent, 0);
    assert.equal(db.communications[0].outcome, 'provider_rejected');
    const second = await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        attempts += 1;
        return [{ status: 'sent', _id: 'msg-1' }];
      },
    });
    assert.equal(second.sent, 1);
    assert.equal(attempts, 2);
    assert.equal(db.communications.length, 1);
    assert.equal(db.communications[0].outcome, 'accepted');
  });

  await check('9 an ambiguous provider timeout is not retried', async () => {
    const db = memoryDb([reader('timeout')]);
    let attempts = 0;
    await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        attempts += 1;
        const err = new Error('timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      },
    });
    const again = await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        attempts += 1;
      },
    });
    assert.equal(again.sent, 0);
    assert.equal(attempts, 1);
    assert.equal(db.communications[0].outcome, 'delivery_unknown');
  });

  await check('10 an accepted message is not sent twice', async () => {
    const db = memoryDb([reader('once')]);
    let sends = 0;
    const send = () => {
      sends += 1;
      return [{ status: 'sent' }];
    };
    await runPromotionalNurture(db, { postalAddress: POSTAL }, { ...gates(), authorize: async () => authOk(), send });
    await runPromotionalNurture(db, { postalAddress: POSTAL }, { ...gates(), authorize: async () => authOk(), send });
    assert.equal(sends, 1);
    assert.equal(db.communications.length, 1);
  });

  await check('11 two concurrent runners create one delivery', async () => {
    const db = memoryDb([reader('race')]);
    let sends = 0;
    const run = () => runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        sends += 1;
        return [{ status: 'sent' }];
      },
    });
    await Promise.all([run(), run()]);
    assert.equal(sends, 1);
    assert.equal(db.communications.length, 1);
  });

  await check('12 a later date does not create a second lifetime claim', async () => {
    const db = memoryDb([reader('later')]);
    let sends = 0;
    const send = () => {
      sends += 1;
      return [{ status: 'sent' }];
    };
    await runPromotionalNurture(db, { postalAddress: POSTAL, now: '2026-10-01T00:00:00.000Z' }, {
      ...gates(),
      authorize: async () => authOk(),
      send,
    });
    await runPromotionalNurture(db, { postalAddress: POSTAL, now: '2026-11-01T00:00:00.000Z' }, {
      ...gates(),
      authorize: async () => authOk('qualified_reading', 'prospect_nurture'),
      send,
    });
    assert.equal(sends, 1);
    assert.equal(db.communications.length, 1);
    assert.equal(db.communications[0].sourceRef, 'nurture:later:prospect_nurture');
  });

  await check('13 a missing personal referral code does not send Text a Friend', async () => {
    const db = memoryDb([reader('nocode', { referralCode: '' })]);
    let sends = 0;
    const result = await runPromotionalNurture(db, { postalAddress: POSTAL }, {
      ...gates(),
      authorize: async () => authOk('text_a_friend_day_28', 'reader_recommendation_taf'),
      send() {
        sends += 1;
      },
    });
    assert.equal(result.sent, 0);
    assert.equal(sends, 0);
    assert.equal(db.communications.length, 0);
  });

  await check('14 missing postal address blocks promotional nurturing', async () => {
    const db = memoryDb([reader('nopostal')]);
    let sends = 0;
    const result = await runPromotionalNurture(db, {}, {
      ...gates(),
      authorize: async () => authOk(),
      send() {
        sends += 1;
      },
    });
    assert.equal(result.sent, 0);
    assert.equal(result.reason, 'postal_address_required');
    assert.equal(sends, 0);
  });

  await check('15 an invalid unsubscribe token changes no preference', async () => {
    const row = reader('token');
    const db = memoryDb([row]);
    const token = signPromotionalUnsubscribeToken({ userId: 'token', email: row.email });
    const res = jsonRes();
    await promotionalUnsubscribeHandler({
      method: 'POST',
      body: { token: `${token}x` },
      query: {},
    }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(row.profile.emailMarketingOptOutAt || null, null);
    assert.equal(verifyPromotionalUnsubscribeToken(`${token.slice(0, -1)}aaaa`), null);
    const expired = signPromotionalUnsubscribeToken({
      userId: 'token',
      email: row.email,
      now: new Date('2020-01-01T00:00:00.000Z'),
    });
    assert.equal(verifyPromotionalUnsubscribeToken(expired), null);
    const expiredRes = jsonRes();
    await promotionalUnsubscribeHandler({
      method: 'POST',
      body: { token: expired },
      query: {},
    }, expiredRes, { prisma: db });
    assert.equal(expiredRes.statusCode, 400);
    assert.equal(row.profile.emailMarketingOptOutAt || null, null);
  });

  await check('16 one-click POST records opt-out and GET does not', async () => {
    const row = reader('click');
    const db = memoryDb([row]);
    const token = signPromotionalUnsubscribeToken({ userId: 'click', email: row.email });
    const getRes = jsonRes();
    await promotionalUnsubscribeHandler({ method: 'GET', body: { token }, query: { token } }, getRes, { prisma: db });
    assert.equal(getRes.body.changed, false);
    assert.equal(row.profile.emailMarketingOptOutAt || null, null);
    const postRes = jsonRes();
    await promotionalUnsubscribeHandler({ method: 'POST', body: {}, query: { token } }, postRes, { prisma: db });
    assert.equal(postRes.statusCode, 200);
    assert.equal(postRes.body.promotionalEmail, 'off');
    assert.equal(promotionalConsentState(row.profile).active, false);
    assert.equal(promotionalConsentState(row.profile).optOutSource, 'unsubscribe_link');
    const replay = jsonRes();
    await promotionalUnsubscribeHandler({ method: 'POST', body: { token }, query: {} }, replay, { prisma: db });
    assert.equal(replay.body.changed, false);
    const other = reader('other');
    assert.equal(other.profile.emailMarketingOptOutAt || null, null);
    row.email = 'changed@readers.net';
    const mismatch = jsonRes();
    await promotionalUnsubscribeHandler({
      method: 'POST',
      body: { token },
      query: {},
    }, mismatch, { prisma: db });
    assert.equal(mismatch.statusCode, 400);
    assert.equal(mismatch.body.error, 'identity_mismatch');
  });

  await check('16b an email address unsubscribes without a token, and cannot opt back in', async () => {
    const row = reader('by-email');
    const db = memoryDb([row]);
    const missing = jsonRes();
    await promotionalUnsubscribeHandler({
      method: 'POST',
      body: { email: row.email },
      query: {},
    }, missing, { prisma: db });
    assert.equal(missing.statusCode, 400);
    assert.equal(row.profile.emailMarketingOptOutAt || null, null);
    const unknown = jsonRes();
    await promotionalUnsubscribeHandler({
      method: 'POST',
      body: { email: 'nobody@readers.net', confirm: true },
      query: {},
    }, unknown, { prisma: db });
    assert.equal(unknown.statusCode, 200);
    assert.equal(unknown.body.promotionalEmail, 'off');
    const posted = jsonRes();
    await promotionalUnsubscribeHandler({
      method: 'POST',
      body: { email: row.email, confirm: true },
      query: {},
    }, posted, { prisma: db });
    assert.equal(posted.statusCode, 200);
    assert.equal(posted.body.promotionalEmail, 'off');
    assert.equal(promotionalConsentState(row.profile).active, false);
    assert.equal(promotionalConsentState(row.profile).optOutSource, 'unsubscribe_by_email');
    const revived = await applyPromotionalPreference(db, {
      userId: row.id,
      action: 'opt_in',
      source: 'unsubscribe_by_email',
      explicit: true,
    });
    assert.equal(revived.ok, false);
    assert.equal(revived.error, 'unsupported_action');
    assert.equal(promotionalConsentState(row.profile).active, false);
  });

  await check('17 master gate off blocks system promotional jobs', async () => {
    assert.equal(masterPromotionalSendingEnabled({}), false);
    assert.equal(masterPromotionalSendingEnabled({ PROMOTIONAL_SENDING_ENABLED: 'yes' }), false);
    const jobs = fs.readFileSync(path.join(root, 'server/routes/adminJobs.cjs'), 'utf8');
    const outreach = fs.readFileSync(path.join(root, 'lib/email/runReaderRecommendationOutreach.cjs'), 'utf8');
    const admin = fs.readFileSync(path.join(root, 'lib/email/adminEmailSend.cjs'), 'utf8');
    const quiet = fs.readFileSync(path.join(root, 'scripts/send-quiet-reveal-email.cjs'), 'utf8');
    for (const source of [jobs, outreach, admin, quiet]) {
      assert.match(source, /promotionalDeliveryGate/);
    }
    const nurture = await runPromotionalNurture(memoryDb([reader('gated')]), { postalAddress: POSTAL }, {
      sendingEnabled: true,
      masterEnabled: false,
      authorize: async () => authOk(),
      send() {
        throw new Error('should not send');
      },
    });
    assert.equal(nurture.sent, 0);
    assert.equal(nurture.reason, 'promotional_sending_disabled');
  });

  await check('18 nurture gate off blocks all nurturing treatments', async () => {
    const result = await runPromotionalNurture(memoryDb([reader('nurture-off')]), { postalAddress: POSTAL }, {
      sendingEnabled: false,
      masterEnabled: true,
      authorize: async () => authOk(),
      send() {
        throw new Error('should not send');
      },
    });
    assert.equal(result.enabled, false);
    assert.equal(result.sent, 0);
    assert.equal(result.reason, 'nurture_sending_disabled');
  });

  await check('19 transactional purchase receipt does not read the promotional gates', async () => {
    const purchase = fs.readFileSync(path.join(root, 'src/lib/purchaseEmail.cjs'), 'utf8');
    const webhook = fs.readFileSync(path.join(root, 'api/stripe-webhook.cjs'), 'utf8');
    assert.doesNotMatch(purchase, /PROMOTIONAL_SENDING_ENABLED|NURTURE_PROMOTIONAL_SENDING|promotionalDeliveryGate/);
    assert.doesNotMatch(webhook, /promotionalDeliveryGate|PROMOTIONAL_SENDING_ENABLED/);
  });

  await check('20 user-initiated referral messages do not use the master gate', async () => {
    const invite = fs.readFileSync(path.join(root, 'api/referrals/invite.cjs'), 'utf8');
    const refer = fs.readFileSync(path.join(root, 'server/routes/referFriend.cjs'), 'utf8');
    assert.doesNotMatch(invite, /PROMOTIONAL_SENDING_ENABLED|promotionalDeliveryGate/);
    assert.doesNotMatch(refer, /PROMOTIONAL_SENDING_ENABLED|promotionalDeliveryGate/);
  });

  await check('placeholder domains and configured test recipients are excluded', async () => {
    const placeholder = await lookupPromotionalConsent(memoryDb([
      reader('fake', { email: 'person@example.com' }),
    ]), { userId: 'fake' });
    assert.equal(placeholder.allowed, false);
    assert.equal(placeholder.reason, 'no_mailable_email');
    process.env.PROMOTIONAL_EXCLUDED_EMAILS = 'kept@readers.net';
    const excluded = await lookupPromotionalConsent(memoryDb([
      reader('kept', { email: 'kept@readers.net' }),
    ]), { userId: 'kept' });
    delete process.env.PROMOTIONAL_EXCLUDED_EMAILS;
    assert.equal(excluded.allowed, false);
    assert.equal(excluded.reason, 'test_recipient_excluded');
    const gmail = await lookupPromotionalConsent(memoryDb([
      reader('real', { email: 'reader@gmail.com' }),
    ]), { userId: 'real' });
    assert.equal(gmail.allowed, true);
  });

  await check('unknown consent source fails closed', async () => {
    const result = await lookupPromotionalConsent(memoryDb([
      reader('bad', { source: 'imported-list' }),
    ]), { userId: 'bad' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'consent_source_unrecognized');
  });

  await check('legacy promotional delivery claims before send and does not call Mailchimp itself', async () => {
    const row = reader('legacy-job');
    const db = memoryDb([row]);
    let providerCalls = 0;
    const sent = await deliverLegacyPromotional(db, {
      user: { id: row.id },
      email: row.email,
      sentAtField: 'engagedEmailSentAt',
      fromEmail: 'hello@theagnesprotocol.com',
      client: {
        messages: {
          send: async () => [{ status: 'sent', _id: 'legacy-1' }],
        },
      },
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      postalAddress: POSTAL,
    }, {
      checkTransactionalSuppression: async () => {
        providerCalls += 1;
        return { checked: true, suppressed: false };
      },
    });
    assert.equal(sent.sent, true);
    assert.equal(providerCalls, 2);
    assert.ok(row.engagedEmailSentAt);
    const duplicate = await deliverLegacyPromotional(db, {
      user: { id: row.id },
      email: row.email,
      sentAtField: 'engagedEmailSentAt',
      fromEmail: 'hello@theagnesprotocol.com',
      client: { messages: { send: async () => { throw new Error('duplicate'); } } },
      subject: 'Hello',
      html: '<p>Hello</p>',
      postalAddress: POSTAL,
    }, {
      checkTransactionalSuppression: async () => ({ checked: true, suppressed: false }),
    });
    assert.equal(duplicate.sent, false);
    assert.equal(duplicate.reason, 'already_claimed');
  });

  await check('legacy claim is released when consent ends before the provider call', async () => {
    const row = reader('legacy-stop');
    const db = memoryDb([row]);
    let sends = 0;
    const result = await deliverLegacyPromotional(db, {
      user: { id: row.id },
      email: row.email,
      sentAtField: 'engagedEmailSentAt',
      fromEmail: 'hello@theagnesprotocol.com',
      client: {
        messages: {
          send: async () => {
            sends += 1;
            return [{ status: 'sent' }];
          },
        },
      },
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      postalAddress: POSTAL,
    }, {
      checkTransactionalSuppression: async () => {
        row.profile.emailMarketingOptOutAt = '2026-10-21T00:00:00.000Z';
        row.profile.emailMarketingOptOutSource = 'unsubscribe_link';
        return { checked: true, suppressed: false };
      },
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'promotional_opt_out');
    assert.equal(sends, 0);
    assert.equal(row.engagedEmailSentAt || null, null);
  });

  console.log(`verify-promotional-safety: ${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
