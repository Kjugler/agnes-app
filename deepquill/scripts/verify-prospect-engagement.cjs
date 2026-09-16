#!/usr/bin/env node
/**
 * Local fixtures for classifyProspectEngagement and Event identity join.
 * No database, network, email, or app boot.
 * Usage: node scripts/verify-prospect-engagement.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  classifyProspectEngagement,
  ENGAGEMENT,
  RETAILER_ORIGIN,
  REASON,
  MEANINGFUL_DWELL_SECONDS,
  B2_TRUE_RESUME_DEPLOYED_AT_ISO,
  isReadersAgreeLeadAttribution,
  IDENTITY_ANCHOR,
} = require('../lib/readers/classifyProspectEngagement.cjs');
const { classifyReader, OWNERSHIP, REVIEW } = require('../lib/readers/classifyReader.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');
const {
  selectProspectEngagementEvents,
  visitorIdsFromLeadAttribution,
} = require('../lib/readers/prospectEngagementEvents.cjs');

let failed = 0;
let passed = 0;

const POST_B2 = B2_TRUE_RESUME_DEPLOYED_AT_ISO;
const PRE_B2 = '2026-09-16T16:20:31.692Z';

function snapshot(value) {
  return JSON.stringify(value);
}

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(`    ${err.message}`);
  }
}

function stageALead(extra = {}) {
  return {
    capturedAt: extra.capturedAt || '2026-09-16T16:00:00.000Z',
    captureSurface: extra.captureSurface || 'landing',
    visitorId: extra.visitorId === undefined ? 'vid-1' : extra.visitorId,
    channel: extra.channel || 'unknown',
  };
}

function ev(type, extra = {}) {
  const meta = {
    source: extra.source,
    visitorId: extra.visitorId,
    retailerOrigin: extra.retailerOrigin,
    chapterId: extra.chapterId,
    secondsOnPage: extra.secondsOnPage,
    mode: extra.mode,
    beatId: extra.beatId,
    ...(extra.meta || {}),
  };
  return {
    type,
    userId: extra.userId === undefined ? 'u1' : extra.userId,
    createdAt: extra.createdAt || '2026-09-16T16:00:00.000Z',
    meta,
  };
}

function serverEmail(extra = {}) {
  return ev(FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-1',
    ...extra,
  });
}

function assertSafeContext(ctx) {
  const json = JSON.stringify(ctx);
  assert.ok(!Object.prototype.hasOwnProperty.call(ctx, 'visitorId'));
  assert.ok(!Object.prototype.hasOwnProperty.call(ctx, 'secondsOnPage'));
  assert.ok(!Object.prototype.hasOwnProperty.call(ctx, 'seconds'));
  assert.ok(!Object.prototype.hasOwnProperty.call(ctx, 'depthPercent'));
  assert.ok(!Object.prototype.hasOwnProperty.call(ctx, 'ap_funnel_uid'));
  assert.doesNotMatch(json, /"visitorId"/);
  assert.doesNotMatch(json, /ap_funnel_uid/);
  assert.doesNotMatch(json, /secondsOnPage/);
  assert.doesNotMatch(json, /depthPercent/);
  assert.strictEqual(ctx.analyticsOnly, true);
}

function classify(input) {
  const src = { leadAttribution: stageALead(), ...(input || {}) };
  const before = snapshot(src);
  const first = classifyProspectEngagement(src);
  assert.strictEqual(snapshot(src), before, 'input was mutated');
  assert.deepStrictEqual(classifyProspectEngagement(src), first, 'repeated calls differed');
  assertSafeContext(first);
  return first;
}

check('unrelated ReaderProfile is not classified', () => {
  const result = classify({ leadAttribution: null, events: [] });
  assert.strictEqual(result.engagement, null);
  assert.strictEqual(result.identityAnchor, null);
  assert.strictEqual(result.sampleEngaged, false);
  assert.deepStrictEqual(result.reasons, []);
});

check('unrelated purchaser is not identified', () => {
  const result = classify({
    leadAttribution: null,
    events: [
      ev(FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, { source: 'server', userId: 'buyer' }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
        userId: 'buyer',
        chapterId: '1',
        secondsOnPage: 90,
      }),
    ],
  });
  assert.strictEqual(result.engagement, null);
  assert.ok(!result.reasons.includes(REASON.EMAIL_CAPTURED));
});

check('unrelated gifted owner is not identified', () => {
  const result = classify({
    leadAttribution: { visitorId: 'gift-vid', captureSurface: 'landing' },
    events: [ev(FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED, { chapterId: '1' })],
  });
  assert.strictEqual(isReadersAgreeLeadAttribution({ visitorId: 'gift-vid', captureSurface: 'landing' }), false);
  assert.strictEqual(result.engagement, null);
});

check('Phase D enrolledAt snapshot is not a Stage A identity anchor', () => {
  const result = classify({
    leadAttribution: {
      visitorId: 'legacy-vid',
      captureSurface: 'landing',
      enrolledAt: '2026-08-19T18:00:00.000Z',
    },
    events: [],
  });
  assert.strictEqual(result.engagement, null);
});

check('Readers Agree lead is identified', () => {
  const result = classify({
    events: [serverEmail({ retailerOrigin: 'amazon', createdAt: '2026-09-16T12:00:00.000Z' })],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.IDENTIFIED);
  assert.strictEqual(result.identityAnchor, IDENTITY_ANCHOR);
  assert.strictEqual(result.sampleEngaged, false);
  assert.strictEqual(result.retailerReturn, false);
  assert.strictEqual(result.retailerOrigin, RETAILER_ORIGIN.AMAZON);
  assert.deepStrictEqual(result.chaptersSampled, []);
  assert.strictEqual(result.latestEngagementAt, '2026-09-16T12:00:00.000Z');
  assert.ok(result.reasons.includes(REASON.EMAIL_CAPTURED));
  assert.ok(!result.reasons.includes(REASON.DWELL_90S));
});

check('RA lead without Event rows is still identified', () => {
  const result = classify({ events: [] });
  assert.strictEqual(result.engagement, ENGAGEMENT.IDENTIFIED);
  assert.ok(result.reasons.includes(REASON.EMAIL_CAPTURED));
});

check('chapter open only does not qualify', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, { chapterId: '1' }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.IDENTIFIED);
  assert.strictEqual(result.sampleEngaged, false);
  assert.deepStrictEqual(result.chaptersSampled, ['1']);
  assert.ok(result.reasons.includes(REASON.CHAPTER_OPENED));
  assert.ok(!result.reasons.includes(REASON.DWELL_90S));
});

check('short dwell does not qualify', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, { chapterId: '1' }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 30 }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.IDENTIFIED);
  assert.strictEqual(result.sampleEngaged, false);
  assert.ok(!result.reasons.includes(REASON.DWELL_90S));
  assert.ok(!result.reasons.includes(REASON.DWELL_90S_SUM));
});

check('RA lead + 90-second sample is sample_engaged', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, { chapterId: '1' }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
        chapterId: '1',
        secondsOnPage: MEANINGFUL_DWELL_SECONDS,
        createdAt: '2026-09-16T16:10:00.000Z',
      }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.strictEqual(result.sampleEngaged, true);
  assert.ok(result.reasons.includes(REASON.DWELL_90S));
  assert.strictEqual(result.latestEngagementAt, '2026-09-16T16:10:00.000Z');
});

check('same-chapter accumulated dwell reaching 90 seconds', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
        chapterId: '2',
        secondsOnPage: 40,
        createdAt: '2026-09-16T16:01:00.000Z',
      }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
        chapterId: '2',
        secondsOnPage: 50,
        createdAt: '2026-09-16T16:20:00.000Z',
      }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.ok(result.reasons.includes(REASON.DWELL_90S_SUM));
  assert.ok(!result.reasons.includes(REASON.DWELL_90S));
  assert.deepStrictEqual(result.chaptersSampled, ['2']);
});

check('Jody qualification despite undercounted dwell', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 20 }),
      ev(FUNNEL_EVENT_TYPES.JODY_APPEAR, {
        chapterId: '1',
        mode: 'remember-offer',
        beatId: 'remember-offer',
        createdAt: '2026-09-16T16:30:00.000Z',
      }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.ok(result.reasons.includes(REASON.JODY_90S));
  assert.ok(!result.reasons.includes(REASON.DWELL_90S));
});

check('Jody chapter-completed qualifies', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED, { chapterId: '1' }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.ok(result.reasons.includes(REASON.JODY_90S));
});

check('return-welcome Jody appear does not qualify', () => {
  const result = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.JODY_APPEAR, { chapterId: '1', mode: 'return-welcome' }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.IDENTIFIED);
  assert.ok(!result.reasons.includes(REASON.JODY_90S));
});

check('remembered-place qualification', () => {
  const result = classify({
    events: [serverEmail()],
    lastCompletedChapterId: '1',
    lastCompletedAt: '2026-09-16T17:00:00.000Z',
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.ok(result.reasons.includes(REASON.REMEMBERED_PLACE));
  assert.deepStrictEqual(result.chaptersSampled, ['1']);
  assert.strictEqual(result.latestEngagementAt, '2026-09-16T17:00:00.000Z');
});

check('RA lead + post-B2 return + sample is retailer_return_engaged', () => {
  const result = classify({
    events: [
      serverEmail({ retailerOrigin: 'amazon' }),
      ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
        userId: null,
        retailerOrigin: 'amazon',
        createdAt: POST_B2,
      }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 90 }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.RETAILER_RETURN_ENGAGED);
  assert.strictEqual(result.retailerReturn, true);
  assert.strictEqual(result.sampleEngaged, true);
  assert.strictEqual(result.retailerOrigin, RETAILER_ORIGIN.AMAZON);
  assert.ok(result.reasons.includes(REASON.RETAILER_RETURN));
  assert.ok(result.reasons.includes(REASON.DWELL_90S));
});

check('pre-B2 RETURN + sample is not retailer-return engaged', () => {
  const result = classify({
    events: [
      serverEmail({ retailerOrigin: 'amazon' }),
      ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
        userId: null,
        retailerOrigin: 'amazon',
        createdAt: PRE_B2,
      }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 90 }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.strictEqual(result.retailerReturn, false);
  assert.ok(!result.reasons.includes(REASON.RETAILER_RETURN));
});

check('click/origin without true return is not retailer-return engaged', () => {
  const result = classify({
    events: [
      serverEmail({ retailerOrigin: 'amazon' }),
      ev(FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK, { retailerOrigin: 'amazon' }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 90 }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.strictEqual(result.retailerReturn, false);
  assert.strictEqual(result.retailerOrigin, RETAILER_ORIGIN.AMAZON);
  assert.ok(!result.reasons.includes(REASON.RETAILER_RETURN));
});

check('retailer return without sample engagement stays identified', () => {
  const result = classify({
    events: [
      serverEmail({ retailerOrigin: 'bn' }),
      ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
        userId: null,
        retailerOrigin: 'bn',
        createdAt: POST_B2,
      }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, { chapterId: '1' }),
    ],
  });
  assert.strictEqual(result.engagement, ENGAGEMENT.IDENTIFIED);
  assert.strictEqual(result.retailerReturn, true);
  assert.strictEqual(result.sampleEngaged, false);
  assert.strictEqual(result.retailerOrigin, RETAILER_ORIGIN.BN);
});

check('Amazon vs B&N origin', () => {
  const amazon = classify({
    events: [serverEmail({ retailerOrigin: 'amazon' })],
  });
  const bn = classify({
    events: [serverEmail({ retailerOrigin: 'bn' })],
  });
  assert.strictEqual(amazon.retailerOrigin, RETAILER_ORIGIN.AMAZON);
  assert.strictEqual(bn.retailerOrigin, RETAILER_ORIGIN.BN);
});

check('pre-identification return joins through leadAttribution visitorId', () => {
  const lead = stageALead({ visitorId: 'vid-join' });
  const events = [
    serverEmail({ visitorId: 'vid-join', retailerOrigin: 'amazon' }),
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
      userId: null,
      visitorId: 'vid-join',
      retailerOrigin: 'amazon',
      createdAt: POST_B2,
    }),
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
      userId: null,
      visitorId: 'someone-else',
      retailerOrigin: 'bn',
      createdAt: POST_B2,
    }),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
      chapterId: '1',
      secondsOnPage: 90,
    }),
  ];
  const visitors = visitorIdsFromLeadAttribution(lead);
  assert.deepStrictEqual([...visitors], ['vid-join']);
  const selected = selectProspectEngagementEvents(events, { userId: 'u1', visitorIds: visitors });
  assert.strictEqual(
    selected.filter((row) => row.type === FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN).length,
    1,
  );
  const result = classify({ leadAttribution: lead, events: selected });
  assert.strictEqual(result.engagement, ENGAGEMENT.RETAILER_RETURN_ENGAGED);
  assert.strictEqual(result.retailerOrigin, RETAILER_ORIGIN.AMAZON);
});

check('forged meta.source=server funnel Event cannot create the RA identity anchor', () => {
  const spoofed = [
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
      userId: 'u1',
      source: 'server',
      visitorId: 'vid-spoof',
    }),
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
      userId: null,
      visitorId: 'vid-spoof',
      createdAt: POST_B2,
    }),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
      userId: 'u1',
      chapterId: '1',
      secondsOnPage: 90,
    }),
  ];
  const selected = selectProspectEngagementEvents(spoofed, { userId: 'u1' });
  assert.ok(selected.every((row) => row.userId === 'u1'));
  assert.ok(!selected.some((row) => row.type === FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN));
  const withoutLead = classify({ leadAttribution: null, events: selected });
  assert.strictEqual(withoutLead.engagement, null);
  const withUnrelatedLead = classify({
    leadAttribution: stageALead({ visitorId: 'other-vid' }),
    events: selected,
  });
  assert.strictEqual(withUnrelatedLead.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.strictEqual(withUnrelatedLead.retailerReturn, false);
});

check('forged bare client userId cannot create the RA identity anchor', () => {
  const spoofed = [
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
      userId: 'stranger',
      source: 'sample-chapter-reader',
      visitorId: 'vid-spoof',
    }),
    ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, {
      userId: null,
      visitorId: 'vid-spoof',
      createdAt: POST_B2,
    }),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
      userId: 'stranger',
      chapterId: '1',
      secondsOnPage: 90,
    }),
  ];
  const selected = selectProspectEngagementEvents(spoofed, { userId: 'u1' });
  assert.strictEqual(selected.length, 0);
  const result = classify({ leadAttribution: null, events: selected });
  assert.strictEqual(result.engagement, null);
  assert.strictEqual(result.sampleEngaged, false);
  assert.strictEqual(result.retailerReturn, false);
});

check('events owned by another user are not joined even with the same visitorId', () => {
  const lead = stageALead({ visitorId: 'vid-shared' });
  const events = [
    serverEmail({ visitorId: 'vid-shared' }),
    ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
      userId: 'other-user',
      visitorId: 'vid-shared',
      chapterId: '1',
      secondsOnPage: 90,
    }),
  ];
  const selected = selectProspectEngagementEvents(events, {
    userId: 'u1',
    visitorIds: visitorIdsFromLeadAttribution(lead),
  });
  assert.ok(selected.every((row) => row.userId === 'u1' || row.userId == null));
  const result = classify({ leadAttribution: lead, events: selected });
  assert.strictEqual(result.sampleEngaged, false);
});

check('purchaser who samples remains purchaser', () => {
  const ownership = classifyReader({
    userId: 'buyer',
    email: 'buyer@example.net',
    purchases: [{ sessionId: 'cs_live_1', saleStatus: 'live', purchasedAt: '2026-09-01' }],
  });
  const engagement = classify({
    events: [
      serverEmail({ userId: 'buyer' }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
        userId: 'buyer',
        chapterId: '1',
        secondsOnPage: 90,
      }),
    ],
  });
  assert.strictEqual(ownership.ownership, OWNERSHIP.PURCHASER);
  assert.strictEqual(ownership.nurtureSuppressed, true);
  assert.strictEqual(engagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
});

check('gifted owner who samples remains gifted owner', () => {
  const ownership = classifyReader({
    userId: 'gift',
    email: 'gift@example.net',
    evidence: [{ kind: 'gift_book_owner', status: 'confirmed', purchaseDate: '2026-04-01' }],
  });
  const engagement = classify({
    events: [
      serverEmail({ userId: 'gift' }),
      ev(FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED, { userId: 'gift', chapterId: '1' }),
    ],
  });
  assert.strictEqual(ownership.ownership, OWNERSHIP.BOOK_OWNER_GIFTED);
  assert.strictEqual(ownership.nurtureSuppressed, true);
  assert.strictEqual(engagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
});

check('unknown/mixed/provisional ownership does not become nurture-safe', () => {
  const unknown = classifyReader({
    profile: { readerType: 'purchased' },
    email: 'maybe@example.net',
  });
  const provisional = classifyReader({
    email: 'bn@example.net',
    evidence: [{ kind: 'manual_bn', status: 'provisional', sourceLabel: 'bn' }],
  });
  const engagement = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 90 }),
    ],
  });
  assert.strictEqual(unknown.ownership, OWNERSHIP.UNKNOWN);
  assert.strictEqual(unknown.review, REVIEW.INCOMPLETE);
  assert.strictEqual(unknown.nurtureSuppressed, true);
  assert.strictEqual(provisional.confidence, 'provisional');
  assert.strictEqual(provisional.nurtureSuppressed, true);
  assert.strictEqual(engagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
});

check('archived/DNC classification remains suppressed independently of engagement', () => {
  const archived = classifyReader({
    email: 'arch@example.net',
    profile: { status: 'archived', readerType: 'prospect' },
  });
  const dnc = classifyReader({
    email: 'dnc@example.net',
    doNotContact: true,
  });
  const engagement = classify({
    events: [
      serverEmail(),
      ev(FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN, { userId: null, createdAt: POST_B2 }),
      ev(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, { chapterId: '1', secondsOnPage: 120 }),
    ],
  });
  assert.strictEqual(archived.nurtureSuppressed, true);
  assert.strictEqual(dnc.nurtureSuppressed, true);
  assert.strictEqual(dnc.contactability, 'suppressed_do_not_contact');
  assert.strictEqual(engagement.engagement, ENGAGEMENT.RETAILER_RETURN_ENGAGED);
});

check('C1 modules do not write, send, enroll, or change jobs', () => {
  const classifySrc = fs.readFileSync(
    path.join(__dirname, '../lib/readers/classifyProspectEngagement.cjs'),
    'utf8',
  );
  const eventsSrc = fs.readFileSync(
    path.join(__dirname, '../lib/readers/prospectEngagementEvents.cjs'),
    'utf8',
  );
  const readSrc = fs.readFileSync(path.join(__dirname, '../lib/readers/readerLifecycleRead.cjs'), 'utf8');
  const vercel = fs.readFileSync(path.join(__dirname, '../../agnes-next/vercel.json'), 'utf8');
  for (const src of [classifySrc, eventsSrc]) {
    assert.doesNotMatch(src, /prisma\.(user|readerProfile|event)\.(create|update|upsert|delete)/);
    assert.doesNotMatch(src, /prospectNurtureEnrolledAt\s*:/);
    assert.doesNotMatch(src, /trySendProspectNurture|send-prospect-nurture|sendEmail/);
    assert.doesNotMatch(src, /require\(['"][^'"]*sendEmail/);
  }
  assert.doesNotMatch(classifySrc, /require\(['"].*prisma/);
  assert.match(eventsSrc, /findMany only/);
  assert.match(readSrc, /asReadOnlyPrisma/);
  assert.match(readSrc, /classifyProspectEngagement/);
  assert.match(readSrc, /leadAttribution/);
  assert.doesNotMatch(readSrc, /prospectNurtureEnrolledAt\s*:/);
  assert.doesNotMatch(vercel, /prospect-nurture/);
  assert.match(classifySrc, /B2_TRUE_RESUME_DEPLOYED_AT/);
  assert.doesNotMatch(classifySrc, /email_known/);
});

if (failed) {
  console.error(`\nverify-prospect-engagement: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nverify-prospect-engagement: ${passed} passed`);
