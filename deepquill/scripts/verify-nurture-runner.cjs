/**
 * Promotional nurturing runner. No network and no real email.
 * Usage: node scripts/verify-nurture-runner.cjs
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');

delete process.env.NURTURE_PROMOTIONAL_SENDING;
delete process.env.PROMOTIONAL_SENDING_ENABLED;
process.env.FULFILLMENT_TOKEN_SECRET = 'local-nurture-runner-secret-32ch';
process.env.PROMOTIONAL_UNSUBSCRIBE_SECRET = 'local-nurture-unsubscribe-secret-32';

const { nurturingSendEnabled } = require('../lib/readers/nurtureActivation.cjs');
const { lookupPromotionalConsent } = require('../lib/readers/lookupPromotionalConsent.cjs');
const { buildNurtureMessage } = require('../lib/email/builders/nurtureMessage.cjs');
const { runPromotionalNurture } = require('../lib/readers/runPromotionalNurture.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');

const POSTAL = '100 Test Street, Test City, TS 00000';

function profile(consentAt, optOutAt, source) {
  return {
    emailMarketingConsentAt: consentAt,
    emailMarketingOptOutAt: optOutAt || null,
    emailMarketingConsentSource: source === undefined && consentAt ? 'reader_preferences' : (source || null),
    status: 'active',
  };
}

function openGates(extra = {}) {
  return { sendingEnabled: true, masterEnabled: true, ...extra };
}

function matchesClaim(row, where) {
  if (!where) return true;
  if (where.source && row.source !== where.source) return false;
  if (where.sourceRef && row.sourceRef !== where.sourceRef) return false;
  if (typeof where.outcome === 'string' && row.outcome !== where.outcome) return false;
  if (where.outcome && Array.isArray(where.outcome.in) && !where.outcome.in.includes(row.outcome)) return false;
  return true;
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
      async updateMany({ where, data }) {
        const matches = communications.filter((row) => matchesClaim(row, where));
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
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
  assert.equal(message.subject, 'A little something from Jody');
  assert.match(message.text, /sample chapters/i);
  assert.match(message.text, /Unsubscribe:/);
  assert.match(message.html, /jody-icons\/jody-em1\.png/);
  assert.match(message.html, /Explore the Sample Chapters/);
  assert.doesNotMatch(message.html, /jody-truth\.png|jody-ascension/);
  const qualified = buildNurtureMessage({
    treatment: 'qualified_reading',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.equal(qualified.subject, 'Picking up the thread');
  assert.match(qualified.html, /jody-icons\/jody-em12\.png/);
  assert.doesNotMatch(qualified.html, /jody-em1\.png|jody-truth\.png|jody-ascension/);
  assert.match(qualified.html, /href="https:\/\/www\.theagnesprotocol\.com\/sample-chapters"/);
  assert.match(qualified.html, /href="https:\/\/www\.theagnesprotocol\.com\/catalog"/);
  assert.match(qualified.text, /https:\/\/www\.theagnesprotocol\.com\/catalog/);
  assert.doesNotMatch(qualified.html, /href="https:\/\/www\.theagnesprotocol\.com\/"/);
  assert.match(qualified.text, /Explore Another Chapter:/);
  assert.match(qualified.text, /Discover the Complete Book:/);
  const attributed = buildNurtureMessage({
    treatment: 'qualified_reading',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    siteUrl: 'https://www.theagnesprotocol.com/?ref=HVV8UW&utm_source=friend',
    textAFriendUrl: 'https://www.theagnesprotocol.com/text-a-friend?ref=KEEP',
  });
  assert.match(attributed.html, /href="https:\/\/www\.theagnesprotocol\.com\/catalog\?ref=HVV8UW&amp;utm_source=friend"/);
  assert.match(attributed.text, /https:\/\/www\.theagnesprotocol\.com\/catalog\?ref=HVV8UW&utm_source=friend/);
  assert.match(attributed.html, /href="https:\/\/www\.theagnesprotocol\.com\/sample-chapters"/);
  assert.doesNotMatch(attributed.html, /sample-chapters\?/);
  const multi = buildNurtureMessage({
    treatment: 'multi_chapter_reading',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.equal(multi.subject, "You're starting to see the pieces...");
  assert.match(multi.html, /jody-icons\/jody-em2\.png/);
  assert.doesNotMatch(multi.html, /jody-em1\.png|jody-em12\.png|jody-truth\.png|jody-ascension/);
  assert.match(multi.html, />Explore the Sample Chapters</);
  assert.match(multi.html, />Discover the Complete Novel</);
  assert.match(multi.text, /Explore the Sample Chapters:/);
  assert.match(multi.text, /Discover the Complete Novel:/);
  assert.match(multi.html, /href="https:\/\/www\.theagnesprotocol\.com\/catalog"/);
  assert.match(multi.text, /https:\/\/www\.theagnesprotocol\.com\/catalog/);
  const resume = buildNurtureMessage({
    treatment: 'checkout_resume',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.equal(resume.subject, "Whenever you're ready");
  assert.match(resume.html, /jody-icons\/jody-em1\.png/);
  assert.match(resume.html, /href="https:\/\/www\.theagnesprotocol\.com\/catalog"/);
  assert.match(resume.html, /href="https:\/\/www\.theagnesprotocol\.com\/sample-chapters"/);
  assert.doesNotMatch(resume.html, /cart|saved your|your place|checkout/i);
  assert.doesNotMatch(resume.text, /cart|saved your|your place|checkout/i);
  const buyIntentNote = buildNurtureMessage({
    treatment: 'buy_intent',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.equal(buyIntentNote.subject, 'A little something worth knowing about The Agnes Protocol');
  assert.match(buyIntentNote.html, /jody-icons\/jody-ig\.png/);
  assert.match(buyIntentNote.html, /href="https:\/\/www\.theagnesprotocol\.com\/catalog"/);
  assert.match(buyIntentNote.html, /href="https:\/\/www\.theagnesprotocol\.com\/sample-chapters"/);
  assert.match(buyIntentNote.text, /complete eBook at no additional charge/);
  assert.doesNotMatch(buyIntentNote.html, /checkout|jody-truth\.png|jody-ascension/);
  const retailer = buildNurtureMessage({
    treatment: 'retailer_return',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.equal(retailer.subject, "There's something waiting for you...");
  assert.match(retailer.html, /jody-icons\/jody-fb\.png/);
  assert.doesNotMatch(retailer.html, /jody-em1\.png|jody-em12\.png|jody-em2\.png|Amazon|Barnes/);
  assert.match(retailer.html, />Take Another Look</);
  assert.match(retailer.html, />Explore the Complete Book</);
  assert.match(retailer.html, /href="https:\/\/www\.theagnesprotocol\.com\/catalog"/);
  assert.match(retailer.text, /https:\/\/www\.theagnesprotocol\.com\/catalog/);
  assert.match(retailer.text, /complete eBook at no additional charge/);
  assert.equal(buildNurtureMessage({
    treatment: 'text_a_friend_day_28',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  }), null);
  const friendNote = buildNurtureMessage({
    treatment: 'text_a_friend_day_28',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    textAFriendUrl: 'https://www.theagnesprotocol.com/text-a-friend?ref=TEST-ONLY',
  });
  assert.equal(friendNote.subject, "If you know someone who'd love this story");
  assert.match(friendNote.html, /jody-icons\/jody-tiktok\.png/);
  assert.match(friendNote.html, /href="https:\/\/www\.theagnesprotocol\.com\/text-a-friend\?ref=TEST-ONLY"/);
  assert.match(friendNote.text, /15% on their paperback purchase/);
  assert.match(friendNote.text, /complete eBook at no additional charge/);
  assert.match(friendNote.text, /It's Jody\./);
  assert.doesNotMatch(friendNote.text, /It's Jody again/);
  assert.doesNotMatch(friendNote.html, /It's Jody again/);
  const returningFriend = buildNurtureMessage({
    treatment: 'text_a_friend_day_28',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    textAFriendUrl: 'https://www.theagnesprotocol.com/text-a-friend?ref=TEST-ONLY',
    priorJodyMessage: true,
  });
  assert.match(returningFriend.text, /It's Jody again\./);
  assert.match(returningFriend.html, /It's Jody again\./);
  const firstQualified = buildNurtureMessage({
    treatment: 'qualified_reading',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.match(firstQualified.text, /It's Jody\./);
  assert.doesNotMatch(firstQualified.text, /It's Jody again/);
  assert.doesNotMatch(friendNote.html, /jody-truth\.png|jody-ascension/);
  const review = buildNurtureMessage({
    treatment: 'honest_review_day_42',
    unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
  });
  assert.equal(review.subject, 'A small favor from Jody');
  assert.match(review.html, /jody-icons\/jody-em2\.png/);
  assert.match(review.html, /href="https:\/\/www\.amazon\.com\/dp\/B0GWQBDH66#customerReviews"/);
  assert.match(review.html, /href="https:\/\/www\.barnesandnoble\.com\/w\/the-agnes-protocol-simon-mcquade\/1147811774\?ean=9798998952609"/);
  assert.match(review.text, /no reward attached/);
  assert.doesNotMatch(review.html, /discount|contest points|15%/i);

  const productionSubjects = {
    identified_followup: 'A little something from Jody',
    qualified_reading: 'Picking up the thread',
    multi_chapter_reading: "You're starting to see the pieces...",
    retailer_return: "There's something waiting for you...",
    buy_intent: 'A little something worth knowing about The Agnes Protocol',
    checkout_resume: "Whenever you're ready",
    text_a_friend_day_28: "If you know someone who'd love this story",
    honest_review_day_42: 'A small favor from Jody',
  };
  const subjectMarker = /\[TEST|JODY #|identified_followup|qualified_reading|multi_chapter_reading|retailer_return|buy_intent|checkout_resume|text_a_friend_day_28|honest_review_day_42|#\d/;
  for (const [treatment, subject] of Object.entries(productionSubjects)) {
    const note = buildNurtureMessage({
      treatment,
      unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
      textAFriendUrl: 'https://www.theagnesprotocol.com/text-a-friend?ref=TEST-ONLY',
    });
    assert.equal(note.subject, subject);
    assert.doesNotMatch(note.subject, subjectMarker);
    assert.doesNotMatch(note.html, /\[TEST — JODY/);
    assert.doesNotMatch(note.text, /\[TEST — JODY/);
    assert.doesNotMatch(note.html, /Reply-To:|Greeting:|From: Jody/);
    assert.doesNotMatch(note.text, /Reply-To:|Greeting:|From: Jody/);
    const addressed = buildNurtureMessage({
      treatment,
      unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
      textAFriendUrl: 'https://www.theagnesprotocol.com/text-a-friend?ref=TEST-ONLY',
      postalAddress: 'DeepQuill LLC, 2779 E. 1600 No., Layton, Utah 84040',
    });
    assert.equal((addressed.html.match(/DeepQuill LLC/g) || []).length, 1);
    assert.match(addressed.html, /2779 E\. 1600 No\., Layton, Utah 84040/);
    assert.match(addressed.text, /2779 E\. 1600 No\., Layton, Utah 84040/);
  }
  assert.match(review.html, />Review on Amazon</);
  assert.match(review.html, />Review on Barnes &amp; Noble</);
  const runnerSource = fs.readFileSync(require.resolve('../lib/readers/runPromotionalNurture.cjs'), 'utf8');
  assert.match(runnerSource, /subject: message\.subject/);
  assert.match(runnerSource, /nurture:\$\{userId\}:\$\{category\}/);
  assert.doesNotMatch(runnerSource, /\[TEST — JODY/);
  const { applyGlobalEmailBanner } = require('../src/lib/emailBanner.cjs');
  assert.equal(
    applyGlobalEmailBanner({ html: review.html, text: review.text, subject: review.subject }).subject,
    review.subject,
  );

  assert.equal(buildNurtureMessage({ treatment: 'missing', unsubscribeUrl: 'https://example.test' }), null);

  const heldFriend = memoryDb([{ id: 'nofriend', email: 'nofriend@readers.net' }]);
  let heldSends = 0;
  const heldRun = await runPromotionalNurture(heldFriend, {}, {
    sendingEnabled: true,
    authorize: async () => ({
      authorized: true,
      treatment: 'text_a_friend_day_28',
      category: 'reader_recommendation_taf',
      timing: '2026-10-18T00:00:00.000Z',
      unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    }),
    send() {
      heldSends += 1;
    },
  });
  assert.equal(heldRun.sent, 0);
  assert.equal(heldSends, 0);
  assert.equal(heldFriend.communications.length, 0);

  const codedFriend = memoryDb([{ id: 'friend', email: 'friend@readers.net', referralCode: 'ADA123' }]);
  let codedText = '';
  const codedRun = await runPromotionalNurture(codedFriend, {
    textAFriendUrl: 'https://www.theagnesprotocol.com/text-a-friend?ref=SHARED',
    postalAddress: POSTAL,
  }, {
    ...openGates(),
    authorize: async () => ({
      authorized: true,
      treatment: 'text_a_friend_day_28',
      category: 'reader_recommendation_taf',
      timing: '2026-10-18T00:00:00.000Z',
      unsubscribeUrl: 'https://www.theagnesprotocol.com/preferences/unsubscribe?token=test',
    }),
    send({ text }) {
      codedText = text;
    },
  });
  assert.equal(codedRun.sent, 1);
  assert.match(codedText, /ref=ADA123/);
  assert.doesNotMatch(codedText, /ref=SHARED/);
  assert.doesNotMatch(codedText, /friend@readers\.net/);

  const prospect = memoryDb([{ id: 'p1', email: 'prospect@readers.net' }]);
  let sentTo = [];
  const first = await runPromotionalNurture(prospect, { postalAddress: POSTAL }, {
    ...openGates(),
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
  const duplicate = await runPromotionalNurture(prospect, { postalAddress: POSTAL }, {
    ...openGates(),
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
  const dueProspect = await runPromotionalNurture(gate, { now: '2026-10-15T16:00:00.000Z', postalAddress: POSTAL }, {
    ...openGates(),
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

  delete process.env.PROMOTIONAL_REPLY_TO;
  const replyBlocked = await runPromotionalNurture({}, { postalAddress: POSTAL }, {
    sendingEnabled: true,
    masterEnabled: true,
  });
  assert.equal(replyBlocked.reason, 'reply_to_required');
  assert.equal(replyBlocked.sent, 0);
  assert.equal(process.env.PROMOTIONAL_REPLY_TO, undefined);

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
      async update({ where, data }) {
        const key = where.source_sourceRef;
        const row = communications.find(
          (item) => item.source === key.source && item.sourceRef === key.sourceRef,
        );
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
    review: { findFirst: async () => null },
    event: { findMany: async () => state.events },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
