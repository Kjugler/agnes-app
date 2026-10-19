/**
 * Promotional nurturing runner. No network and no real email.
 * Usage: node scripts/verify-nurture-runner.cjs
 */
const assert = require('node:assert/strict');

delete process.env.NURTURE_PROMOTIONAL_SENDING;
process.env.FULFILLMENT_TOKEN_SECRET = 'local-nurture-runner-secret-32ch';

const { nurturingSendEnabled } = require('../lib/readers/nurtureActivation.cjs');
const { lookupPromotionalConsent } = require('../lib/readers/lookupPromotionalConsent.cjs');
const { buildNurtureMessage } = require('../lib/email/builders/nurtureMessage.cjs');
const { runPromotionalNurture } = require('../lib/readers/runPromotionalNurture.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');

function profile(consentAt, optOutAt) {
  return {
    emailMarketingConsentAt: consentAt,
    emailMarketingOptOutAt: optOutAt || null,
    status: 'active',
  };
}

function memoryDb(rows = []) {
  const communications = [];
  return {
    communications,
    readerProfile: {
      async findMany() {
        return rows.map((row) => ({ userId: row.id }));
      },
    },
    user: {
      async findUnique({ where }) {
        return rows.find((row) => row.id === where.id || row.email === where.email) || null;
      },
    },
    readerCommunication: {
      async create({ data }) {
        const clash = communications.some(
          (row) => row.source === data.source && row.sourceRef === data.sourceRef,
        );
        if (clash) {
          const err = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        communications.push({ ...data });
        return data;
      },
      async update({ where, data }) {
        const key = where.source_sourceRef;
        const row = communications.find(
          (item) => item.source === key.source && item.sourceRef === key.sourceRef,
        );
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return row;
      },
    },
  };
}

async function main() {
  assert.equal(nurturingSendEnabled({}), false);
  assert.equal(nurturingSendEnabled({ NURTURE_PROMOTIONAL_SENDING: '1' }), true);

  let calls = 0;
  const disabled = await runPromotionalNurture(memoryDb(), {}, {
    send() {
      calls += 1;
    },
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.sent, 0);
  assert.equal(calls, 0);

  const noConsent = await lookupPromotionalConsent({
    user: { findUnique: async () => ({ id: 'a', email: 'a@readers.net', readerProfile: profile(null) }) },
  }, { userId: 'a' });
  assert.equal(noConsent.allowed, false);
  assert.equal(noConsent.reason, 'no_promotional_consent');

  const optedOut = await lookupPromotionalConsent({
    user: {
      findUnique: async () => ({
        id: 'b',
        email: 'b@readers.net',
        readerProfile: profile('2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
      }),
    },
  }, { email: 'b@readers.net' });
  assert.equal(optedOut.allowed, false);
  assert.equal(optedOut.reason, 'promotional_opt_out');

  const consented = await lookupPromotionalConsent({
    user: {
      findUnique: async () => ({
        id: 'c',
        email: 'c@readers.net',
        readerProfile: profile('2026-10-03T00:00:00.000Z'),
      }),
    },
  }, { userId: 'c' });
  assert.equal(consented.allowed, true);

  const message = buildNurtureMessage({
    treatment: 'identified_followup',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.match(message.text, /sample chapters/i);
  assert.match(message.text, /Unsubscribe:/);
  assert.equal(buildNurtureMessage({ treatment: 'missing', unsubscribeUrl: 'https://example.test' }), null);

  const prospect = memoryDb([{ id: 'p1', email: 'prospect@readers.net' }]);
  let sentTo = [];
  const first = await runPromotionalNurture(prospect, {}, {
    sendingEnabled: true,
    authorize: async () => ({
      authorized: true,
      treatment: 'identified_followup',
      category: 'prospect_nurture',
      timing: '2026-10-18T00:00:00.000Z',
      unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    }),
    send({ to, subject }) {
      sentTo.push({ to, subject });
    },
  });
  assert.equal(first.sent, 1);
  assert.equal(sentTo.length, 1);
  assert.equal(prospect.communications.length, 1);
  assert.equal(prospect.communications[0].outcome, 'accepted');

  sentTo = [];
  const duplicate = await runPromotionalNurture(prospect, {}, {
    sendingEnabled: true,
    authorize: async () => ({
      authorized: true,
      treatment: 'identified_followup',
      category: 'prospect_nurture',
      timing: '2026-10-18T00:00:00.000Z',
      unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    }),
    send({ to }) {
      sentTo.push(to);
    },
  });
  assert.equal(duplicate.sent, 0);
  assert.equal(sentTo.length, 0);
  assert.equal(prospect.communications.length, 1);

  const purchaser = memoryDb([{ id: 'buyer', email: 'buyer@readers.net' }]);
  let buyerSends = 0;
  const buyer = await runPromotionalNurture(purchaser, {}, {
    sendingEnabled: true,
    authorize: async () => ({ authorized: false, treatment: 'none', reason: 'purchase_not_a_prospect' }),
    send() {
      buyerSends += 1;
    },
  });
  assert.equal(buyer.sent, 0);
  assert.equal(buyerSends, 0);

  const during = memoryDb([{ id: 'mid', email: 'mid@readers.net' }]);
  let midSends = 0;
  const purchasedDuring = await runPromotionalNurture(during, {}, {
    sendingEnabled: true,
    authorize: async () => ({ authorized: false, reason: 'purchase_confirmed', treatment: 'none' }),
    send() {
      midSends += 1;
    },
  });
  assert.equal(purchasedDuring.sent, 0);
  assert.equal(midSends, 0);

  const unsubscribed = memoryDb([{ id: 'out', email: 'out@readers.net' }]);
  let outSends = 0;
  const stopped = await runPromotionalNurture(unsubscribed, {}, {
    sendingEnabled: true,
    authorize: async () => ({ authorized: false, reason: 'promotional_opt_out', treatment: 'none' }),
    send() {
      outSends += 1;
    },
  });
  assert.equal(stopped.sent, 0);
  assert.equal(outSends, 0);

  const gate = gateDb({
    user: { id: 'p1', email: 'prospect@readers.net', code: 'P1CODE', referralCode: 'P1CODE' },
    profile: {
      userId: 'p1',
      status: 'active',
      readerType: 'prospect',
      emailMarketingConsentAt: '2026-10-02T16:00:00.000Z',
      emailMarketingConsentSource: 'reader_preferences',
      leadAttribution: {
        capturedAt: '2026-10-01T16:00:00.000Z',
        captureSurface: 'landing',
        visitorId: 'vid-runner-1',
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
  const clear = async () => ({ checked: true, suppressed: false, reason: null, providerReason: null });
  let realSends = [];
  const dueProspect = await runPromotionalNurture(gate, { now: '2026-10-15T16:00:00.000Z' }, {
    sendingEnabled: true,
    checkTransactionalSuppression: clear,
    send({ to, text }) {
      realSends.push({ to, text });
    },
  });
  assert.equal(dueProspect.sent, 1);
  assert.match(realSends[0].text, /sample chapters/i);
  assert.equal(gate.communications[0].category, 'prospect_nurture');

  gate.state.profile.emailMarketingConsentAt = null;
  gate.communications.length = 0;
  realSends = [];
  const withoutConsent = await runPromotionalNurture(gate, { now: '2026-10-15T16:00:00.000Z' }, {
    sendingEnabled: true,
    checkTransactionalSuppression: clear,
    send() {
      realSends.push('sent');
    },
  });
  assert.equal(withoutConsent.sent, 0);
  assert.equal(realSends.length, 0);

  gate.state.profile.emailMarketingConsentAt = '2026-10-02T16:00:00.000Z';
  gate.state.profile.readerType = 'purchased';
  gate.state.purchases.push({
    userId: 'p1',
    sessionId: 'cs_runner',
    saleStatus: 'live',
    createdAt: '2026-10-14T16:00:00.000Z',
  });
  const afterPurchase = await runPromotionalNurture(gate, { now: '2026-10-15T16:00:00.000Z' }, {
    sendingEnabled: true,
    checkTransactionalSuppression: clear,
    send() {
      realSends.push('sent');
    },
  });
  assert.equal(afterPurchase.sent, 0);
  assert.equal(realSends.length, 0);
  assert.equal(gate.communications.length, 0);

  console.log('verify-nurture-runner: passed');
}

function gateDb(seed) {
  const communications = [];
  const state = {
    user: seed.user,
    profile: seed.profile,
    purchases: [],
    events: seed.events || [],
  };
  return {
    state,
    communications,
    readerProfile: {
      async findMany() {
        return state.profile && state.profile.emailMarketingConsentAt
          ? [{ userId: state.user.id }]
          : [];
      },
      async findUnique() {
        return state.profile;
      },
    },
    user: {
      async findUnique() {
        return state.user;
      },
    },
    purchase: { findMany: async () => state.purchases },
    readerEvidence: { findMany: async () => [] },
    readerContactDecision: { findMany: async () => [] },
    readerCommunication: {
      async findMany() {
        return communications.map((row) => ({
          category: row.category,
          outcome: row.outcome,
          occurredAt: row.occurredAt,
        }));
      },
      async create({ data }) {
        const clash = communications.some(
          (row) => row.source === data.source && row.sourceRef === data.sourceRef,
        );
        if (clash) {
          const err = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        communications.push({ ...data });
        return data;
      },
    },
    review: { findFirst: async () => null },
    event: { findMany: async () => state.events },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
