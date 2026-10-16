/**
 * Dry-run nurture decisions. No database, network, email, or app boot.
 * Usage: node scripts/verify-nurture-decision.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  decideReaderNurture,
  formatDryRunReport,
  DECISION,
  TREATMENT,
  REVIEW_OUTLINE,
} = require('../lib/readers/nurtureDecision.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');

const NOW = '2026-10-15T16:00:00.000Z';
const MAIL = 'ada@readers.net';

function lead(extra = {}) {
  return {
    capturedAt: '2026-10-01T16:00:00.000Z',
    captureSurface: 'landing',
    visitorId: 'vid-nurture-1',
    channel: 'unknown',
    ...extra,
  };
}

function ev(type, extra = {}) {
  return {
    type,
    userId: 'u1',
    createdAt: extra.createdAt || '2026-10-01T16:00:00.000Z',
    meta: {
      source: extra.source,
      chapterId: extra.chapterId,
      secondsOnPage: extra.secondsOnPage,
      retailerOrigin: extra.retailerOrigin,
      ...(extra.meta || {}),
    },
  };
}

function emailEvent(createdAt = '2026-10-01T16:00:00.000Z') {
  return ev(FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, { source: 'server', createdAt });
}

function base(extra = {}) {
  return {
    readerRef: extra.readerRef || 'reader',
    email: MAIL,
    now: NOW,
    leadAttribution: lead(),
    events: [emailEvent()],
    ...extra,
  };
}

function allowance(outcome, qualifyingMs, chapters, createdAt) {
  const type = {
    snapshot: 'READING_ALLOWANCE_RECORDED',
    gate_reached: 'READING_GATE_REACHED',
    email_accepted: 'READING_GATE_EMAIL_ACCEPTED',
    not_now: 'READING_GATE_NOT_NOW',
  }[outcome];
  return ev(type, {
    createdAt,
    meta: {
      allowanceSource: 'server_allowance',
      outcome,
      qualifyingMs,
      chapterMs1: chapters[1] || 0,
      chapterMs2: chapters[2] || 0,
      chapterMs9: chapters[9] || 0,
      chapterMs45: chapters[45] || 0,
    },
  });
}

const examples = [];

function check(name, input, assertResult) {
  const before = JSON.stringify(input);
  const result = decideReaderNurture(input);
  assert.equal(JSON.stringify(input), before, `${name} mutated input`);
  assert.equal(result.sendsEmail, false, name);
  assert.equal(result.schedulesSend, false, name);
  assert.equal(result.discountAction, 'none', name);
  assert.equal(result.codeAction, 'none', name);
  assert.equal(JSON.stringify(result).includes('"visitorId"'), false, name);
  assertResult(result);
  examples.push(result);
  console.log(`ok  ${name}`);
}

check('identified reader is held without marketing consent', base({ readerRef: 'prospect-identified' }), (result) => {
  assert.equal(result.classification.ownership, 'non_purchaser');
  assert.equal(result.classification.engagement, 'identified');
  assert.equal(result.classification.nurtureSuppressed, false);
  assert.equal(result.recommendedTreatment, TREATMENT.IDENTIFIED_FOLLOWUP);
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.reason, 'reading_access_email_is_not_marketing_consent');
  assert.equal(result.contactPermissionStatus, 'no_marketing_consent');
  assert.equal(result.nurtureOffer, 'none');
  assert.equal(result.wouldBeEligible, false);
});

check('split client time across chapters does not become qualified reading', base({
  readerRef: 'prospect-split-client',
  events: [
    emailEvent(),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 40 }),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '2', secondsOnPage: 50 }),
  ],
}), (result) => {
  assert.equal(result.classification.engagement, 'identified');
  assert.equal(result.recommendedTreatment, TREATMENT.IDENTIFIED_FOLLOWUP);
  assert.equal(result.behavior.some((line) => line.includes('90')), false);
});

check('cumulative server reading recommends a follow-up and does not activate an offer', base({
  readerRef: 'prospect-qualified',
  events: [
    emailEvent('2026-10-14T15:00:00.000Z'),
    allowance('gate_reached', 90000, { 1: 40000, 2: 50000 }, '2026-10-14T15:00:00.000Z'),
    allowance('email_accepted', 90000, { 1: 40000, 2: 50000 }, '2026-10-14T15:00:00.000Z'),
  ],
}), (result) => {
  assert.equal(result.classification.engagement, 'sample_engaged');
  assert.equal(result.recommendedTreatment, TREATMENT.MULTI_CHAPTER);
  assert.equal(result.recommendedTiming, '2026-10-15T15:00:00.000Z');
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.nurtureOffer, 'candidate_not_activated');
  assert.equal(result.referralDiscountStatus, 'none');
  assert.ok(result.behavior.some((line) => line.includes('chapter 1 40000')));
});

check('a qualifying referral blocks a nurturing discount', base({
  readerRef: 'prospect-referral',
  qualifyingReferral: true,
  referralCode: 'FRIEND2',
  leadAttribution: lead({ ref: 'FRIEND2' }),
  events: [
    emailEvent('2026-10-14T15:00:00.000Z'),
    allowance('gate_reached', 90000, { 1: 90000 }, '2026-10-14T15:00:00.000Z'),
  ],
}), (result) => {
  assert.equal(result.referralDiscountStatus, 'qualifying');
  assert.equal(result.nurtureOffer, 'blocked_by_referral');
  assert.equal(result.recommendedTreatment, TREATMENT.QUALIFIED_READING);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'referralCode'), false);
});

check('an unverified stored code is also left in place', base({
  readerRef: 'prospect-unverified-code',
  preferredDiscountCode: 'STORED1',
  events: [
    emailEvent('2026-10-14T16:00:00.000Z'),
    allowance('gate_reached', 90000, { 1: 90000 }, '2026-10-14T16:02:00.000Z'),
  ],
}), (result) => {
  assert.equal(result.referralDiscountStatus, 'requires_resolution');
  assert.equal(result.nurtureOffer, 'blocked_pending_resolution');
});

check('checkout resume waits one day and stays held', base({
  readerRef: 'prospect-checkout',
  events: [
    emailEvent('2026-10-13T16:00:00.000Z'),
    ev(FUNNEL_EVENT_TYPES.CHECKOUT_STARTED, { createdAt: '2026-10-14T12:00:00.000Z' }),
  ],
}), (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.CHECKOUT_RESUME);
  assert.equal(result.recommendedTiming, '2026-10-15T12:00:00.000Z');
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.nurtureOffer, 'candidate_not_activated');
});

check('buy click is recorded without inventing a purchase', base({
  readerRef: 'prospect-buy-click',
  now: '2026-10-14T18:00:00.000Z',
  events: [
    emailEvent(),
    ev(FUNNEL_EVENT_TYPES.CATALOG_BUY_CLICK, { createdAt: '2026-10-14T16:00:00.000Z' }),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK, { createdAt: '2026-10-14T15:00:00.000Z' }),
  ],
}), (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.BUY_INTENT);
  assert.equal(result.finalDecision, DECISION.NOT_YET);
  assert.equal(result.classification.ownership, 'non_purchaser');
});

check('inferred return is not called a measured session', base({
  readerRef: 'prospect-inferred-return',
  events: [
    emailEvent('2026-10-01T16:00:00.000Z'),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, { chapterId: '1', createdAt: '2026-10-02T00:00:00.000Z' }),
  ],
}), (result) => {
  assert.ok(result.behavior.some((line) => line.includes('Measured sessions: unavailable')));
  assert.ok(result.behavior.some((line) => line.includes('Inferred returns: 1')));
  assert.ok(result.behavior.some((line) => line.includes('not a measured visit')));
  assert.equal(result.behavior.some((line) => /measured session count: [1-9]/i.test(line)), false);
});

check('retailer return uses the confirmed return, not a click alone', base({
  readerRef: 'prospect-retailer-return',
  events: [
    emailEvent('2026-10-14T12:00:00.000Z'),
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK, { createdAt: '2026-10-14T12:30:00.000Z' }),
    allowance('gate_reached', 90000, { 1: 90000 }, '2026-10-14T13:00:00.000Z'),
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
      createdAt: '2026-10-14T18:00:00.000Z',
      retailerOrigin: 'amazon',
    }),
  ],
}), (result) => {
  assert.equal(result.classification.engagement, 'retailer_return_engaged');
  assert.equal(result.recommendedTreatment, TREATMENT.RETAILER_RETURN);
  assert.ok(result.behavior.some((line) => line.includes('Confirmed retailer return')));
});

check('day 28 text-a-friend is due and still not sent', {
  ...base({ readerRef: 'purchaser-day-28', events: [], leadAttribution: null }),
  emailMarketingConsentAt: '2026-09-02T16:00:00.000Z',
  confirmedPurchaseAt: '2026-09-01T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  purchases: [{ sessionId: 'cs_live_28', saleStatus: 'live', purchasedAt: '2026-09-01' }],
}, (result) => {
  assert.equal(result.classification.ownership, 'purchaser');
  assert.equal(result.classification.nurtureSuppressed, true);
  assert.equal(result.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);
  assert.equal(result.recommendedTiming, '2026-09-29T16:00:00.000Z');
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.reason, 'provider_check_required');
  assert.equal(result.canSendPromotional, false);
  assert.equal(result.wouldBeEligible, false);
  assert.equal(result.nurtureOffer, 'none');
  assert.match(result.messageOutline, /\$2 reward/);
  assert.match(result.messageOutline, /Text a Friend/);
  assert.equal(result.prerequisite, null);
  assert.equal(result.reviewAnchor, 'awaits_text_a_friend_send');
  assert.equal(result.textAFriendSentAt, null);
});

check('day 10 purchaser is not yet due', {
  ...base({ readerRef: 'purchaser-day-10', events: [], leadAttribution: null }),
  emailMarketingConsentAt: '2026-10-06T16:00:00.000Z',
  confirmedPurchaseAt: '2026-10-05T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  purchases: [{ sessionId: 'cs_live_10', saleStatus: 'live', purchasedAt: '2026-10-05' }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);
  assert.equal(result.finalDecision, DECISION.NOT_YET);
});

check('day 42 review has no incentive and follows a sent text-a-friend', {
  ...base({ readerRef: 'purchaser-day-42', events: [], leadAttribution: null }),
  emailMarketingConsentAt: '2026-08-02T16:00:00.000Z',
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  purchases: [{ sessionId: 'cs_live_42', saleStatus: 'live', purchasedAt: '2026-08-01' }],
  communications: [{
    category: 'reader_recommendation_taf',
    outcome: 'accepted',
    occurredAt: '2026-08-20T16:00:00.000Z',
  }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.HONEST_REVIEW);
  assert.equal(result.recommendedTiming, '2026-09-03T16:00:00.000Z');
  assert.equal(result.reviewAnchor, 'text_a_friend_sent');
  assert.equal(result.textAFriendSentAt, '2026-08-20T16:00:00.000Z');
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.messageOutline, REVIEW_OUTLINE);
  assert.match(result.messageOutline, /Do not offer compensation, a discount, points/);
  assert.doesNotMatch(result.messageOutline, /\$2|you'll receive|in exchange/i);
});

check('a known review is not requested again', {
  ...base({ readerRef: 'purchaser-reviewed', events: [], leadAttribution: null }),
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  knownReview: true,
  purchases: [{ sessionId: 'cs_live_rev', saleStatus: 'live', purchasedAt: '2026-08-01' }],
  communications: [{
    category: 'reader_recommendation_taf',
    outcome: 'accepted',
    occurredAt: '2026-08-29T16:00:00.000Z',
  }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.NONE);
  assert.equal(result.finalDecision, DECISION.NO_TREATMENT);
  assert.equal(result.reason, 'post_purchase_already_requested');
});

check('provisional retailer ownership does not schedule purchaser mail', {
  ...base({ readerRef: 'provisional-amazon', events: [], leadAttribution: null }),
  confirmedPurchaseAt: '2026-07-15T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  evidence: [{
    kind: 'kris_personal_knowledge',
    status: 'provisional',
    sourceLabel: 'Amazon',
    purchaseDate: '2026-07-15',
    details: 'Kris spoke with reader',
  }],
}, (result) => {
  assert.equal(result.classification.ownership, 'purchaser');
  assert.equal(result.classification.confidence, 'provisional');
  assert.equal(result.recommendedTreatment, TREATMENT.NONE);
  assert.equal(result.reason, 'purchase_not_confirmed');
});

check('a gifted owner is suppressed', {
  ...base({ readerRef: 'gifted-owner' }),
  profile: { readerType: 'gifted', source: 'Gift', status: 'active' },
  evidence: [{
    kind: 'gift_book_owner',
    status: 'confirmed',
    sourceLabel: 'gift',
    purchaseDate: null,
    details: null,
  }],
}, (result) => {
  assert.equal(result.classification.ownership, 'book_owner_gifted');
  assert.equal(result.classification.nurtureSuppressed, true);
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'ownership_gifted');
  assert.equal(result.recommendedTreatment, TREATMENT.NONE);
});

check('unknown ownership is suppressed', {
  readerRef: 'unknown-owner',
  email: MAIL,
  now: NOW,
  profile: { readerType: 'purchased', source: 'Website', status: 'active' },
}, (result) => {
  assert.equal(result.classification.ownership, 'unknown');
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'ownership_unknown');
});

check('do not contact suppresses a qualified reader', base({
  readerRef: 'dnc-reader',
  doNotContact: true,
  events: [
    emailEvent('2026-10-14T16:00:00.000Z'),
    allowance('gate_reached', 90000, { 1: 90000 }, '2026-10-14T16:02:00.000Z'),
  ],
}), (result) => {
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'do_not_contact');
  assert.equal(result.contactPermissionStatus, 'suppressed_do_not_contact');
});

check('archive suppresses independently of behavior', base({
  readerRef: 'archived-reader',
  profile: { readerType: 'prospect', source: 'readers-agree-v2', status: 'archived' },
}), (result) => {
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'archived');
});

check('a prior prospect nurture send is not repeated', base({
  readerRef: 'already-nurtured',
  now: '2026-10-20T16:00:00.000Z',
  communications: [{ category: 'prospect_nurture', outcome: 'accepted', occurredAt: '2026-10-05T16:00:00.000Z' }],
}), (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.IDENTIFIED_FOLLOWUP);
  assert.equal(result.finalDecision, DECISION.ALREADY_REQUESTED);
});

check('a purchaser without a personal code still gets day 28', {
  ...base({ readerRef: 'purchaser-no-code', events: [], leadAttribution: null }),
  emailMarketingConsentAt: '2026-09-02T16:00:00.000Z',
  confirmedPurchaseAt: '2026-09-15T16:00:00.000Z',
  purchases: [{ sessionId: 'cs_live_nocode', saleStatus: 'live', purchasedAt: '2026-09-15' }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);
  assert.equal(result.recommendedTiming, '2026-10-13T16:00:00.000Z');
  assert.equal(result.prerequisite, 'personal_referral_code_required');
  assert.equal(result.reviewAnchor, 'awaits_text_a_friend_send');
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.codeAction, 'none');
  assert.ok(result.behavior.some((line) => line.includes('does not create a code')));
});

check('a failed text-a-friend send does not start the review clock', {
  ...base({ readerRef: 'purchaser-taf-failed', events: [], leadAttribution: null }),
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  purchases: [{ sessionId: 'cs_live_fail', saleStatus: 'live', purchasedAt: '2026-08-01' }],
  communications: [{
    category: 'reader_recommendation_taf',
    outcome: 'failed',
    occurredAt: '2026-08-20T16:00:00.000Z',
  }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);
  assert.equal(result.textAFriendSentAt, null);
  assert.equal(result.reviewAnchor, 'awaits_text_a_friend_send');
});

check('review waits 14 days after the actual text-a-friend send', {
  ...base({ readerRef: 'purchaser-review-waiting', events: [], leadAttribution: null, now: '2026-10-15T16:00:00.000Z' }),
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  purchases: [{ sessionId: 'cs_live_wait', saleStatus: 'live', purchasedAt: '2026-08-01' }],
  communications: [{
    category: 'reader_recommendation_taf',
    outcome: 'accepted',
    occurredAt: '2026-10-10T16:00:00.000Z',
  }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.HONEST_REVIEW);
  assert.equal(result.recommendedTiming, '2026-10-24T16:00:00.000Z');
  assert.equal(result.finalDecision, DECISION.NOT_YET);
  assert.equal(result.reviewAnchor, 'text_a_friend_sent');
});

check('a purchaser who cannot receive a code uses the review fallback', {
  ...base({ readerRef: 'purchaser-no-taf', events: [], leadAttribution: null }),
  emailMarketingConsentAt: '2026-08-02T16:00:00.000Z',
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  referralCodeIssuable: false,
  purchases: [{ sessionId: 'cs_live_notaf', saleStatus: 'live', purchasedAt: '2026-08-01' }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.HONEST_REVIEW);
  assert.equal(result.recommendedTiming, '2026-09-12T16:00:00.000Z');
  assert.equal(result.prerequisite, 'personal_referral_code_unavailable');
  assert.equal(result.reviewAnchor, 'purchase_plus_42_fallback');
  assert.equal(result.textAFriendSentAt, null);
  assert.equal(result.finalDecision, DECISION.HOLD);
  assert.equal(result.codeAction, 'none');
});

check('a known review still blocks the fallback', {
  ...base({ readerRef: 'purchaser-fallback-reviewed', events: [], leadAttribution: null }),
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  referralCodeIssuable: false,
  knownReview: true,
  purchases: [{ sessionId: 'cs_live_fb', saleStatus: 'live', purchasedAt: '2026-08-01' }],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.NONE);
  assert.equal(result.reason, 'post_purchase_already_requested');
  assert.equal(result.textAFriendSentAt, null);
});

check('a complaint suppresses the reader', base({
  readerRef: 'complaint-reader',
  providerComplaint: true,
}), (result) => {
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'complaint');
  assert.equal(result.contactPermissionStatus, 'complaint');
});

check('a provider unsubscribe suppresses the reader', base({
  readerRef: 'unsubscribed-reader',
  providerUnsubscribe: true,
}), (result) => {
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'provider_unsubscribe');
});

check('a placeholder address is not mailable', {
  readerRef: 'placeholder-reader',
  email: 'stagea-20261015@example.com',
  now: NOW,
  leadAttribution: lead(),
  events: [emailEvent()],
}, (result) => {
  assert.equal(result.finalDecision, DECISION.SUPPRESSED);
  assert.equal(result.reason, 'no_mailable_email');
  assert.equal(result.contactPermissionStatus, 'no_mailable_email');
});

check('a recorded review invitation is not repeated', {
  ...base({ readerRef: 'purchaser-review-sent', events: [], leadAttribution: null }),
  confirmedPurchaseAt: '2026-08-01T16:00:00.000Z',
  ownReferralCode: 'ADA123',
  purchases: [{ sessionId: 'cs_live_dup', saleStatus: 'live', purchasedAt: '2026-08-01' }],
  communications: [
    { category: 'reader_recommendation_taf', outcome: 'accepted', occurredAt: '2026-08-20T16:00:00.000Z' },
    { category: 'review_invitation', outcome: 'accepted', occurredAt: '2026-09-03T16:00:00.000Z' },
  ],
}, (result) => {
  assert.equal(result.recommendedTreatment, TREATMENT.NONE);
  assert.equal(result.reason, 'post_purchase_already_requested');
  assert.equal(result.textAFriendSentAt, '2026-08-20T16:00:00.000Z');
});

check('the same snapshot decides the same way twice', base({ readerRef: 'stable-reader' }), (result) => {
  const again = decideReaderNurture(base({ readerRef: 'stable-reader' }));
  assert.deepEqual(again, result);
});

{
  const src = fs.readFileSync(path.join(__dirname, '../api/create-checkout-session.cjs'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '../lib/readers/nurtureDecision.cjs'), 'utf8');
  assert.match(src, /textafriendDiscount flag ignored \(referral discount already applied\)/);
  assert.doesNotMatch(engine, /prisma|sendEmail|prospectNurtureEnrolledAt\s*:|preferredDiscountCode\s*=/);
  assert.doesNotMatch(engine, /STRIPE_ASSOCIATE_15_COUPON_ID/);
  console.log('ok  checkout referral precedence is unchanged');
}

const report = formatDryRunReport(examples.filter((row) => [
  'prospect-qualified',
  'prospect-referral',
  'purchaser-day-28',
  'purchaser-no-code',
  'purchaser-day-42',
  'purchaser-no-taf',
  'gifted-owner',
  'unknown-owner',
].includes(row.readerRef)));
assert.match(report, /HOLD — NO SEND/);
assert.match(report, /prospect-referral/);
assert.match(report, /blocked_by_referral/);
assert.match(report, /personal_referral_code_required/);
assert.match(report, /text_a_friend_sent/);
assert.match(report, /purchase_plus_42_fallback/);
console.log('\n' + report);
console.log(`\nverify-nurture-decision: ${examples.length} passed`);
