/**
 * Stage A: server allowance facts, identity attach, and engagement history.
 * No database, network, email, or app boot.
 *
 * Usage: node scripts/verify-reading-allowance-engagement.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.FULFILLMENT_TOKEN_SECRET = process.env.FULFILLMENT_TOKEN_SECRET || 'x'.repeat(40);
process.env.NODE_ENV = 'test';

const {
  classifyProspectEngagement,
  ENGAGEMENT,
} = require('../lib/readers/classifyProspectEngagement.cjs');
const { classifyReader, OWNERSHIP } = require('../lib/readers/classifyReader.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');
const { recordFunnelEvent } = require('../lib/funnel/recordFunnelEvent.cjs');
const { PROSPECT_ENGAGEMENT_EVENT_TYPES, selectProspectEngagementEvents } = require('../lib/readers/prospectEngagementEvents.cjs');
const { recordReadingAllowanceFact } = require('../lib/readers/recordReadingAllowanceFact.cjs');
const { buildLeadAttributionSnapshot } = require('../lib/readers/readersAgreeLead.cjs');
const {
  applyReadingTick,
  emailAcceptanceFact,
  freshAllowanceState,
  markAllowanceRecorded,
  planAllowanceRecord,
  publicAllowance,
  serverGateFact,
  signAllowanceState,
  readAllowanceToken,
} = require('../src/lib/readingAllowance.cjs');

const VISITOR = 'visitor-stage-a1';
const LIMIT = 90_000;

function fakePrisma() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    async $queryRaw(strings, ...values) {
      const sql = strings.join(' ');
      const owned = sql.includes('"userId" =');
      const ownerId = owned ? values[0] : null;
      const type = owned ? values[1] : values[0];
      const visitorId = owned ? values[2] : values[1];
      const outcome = owned ? values[3] : values[2];
      const qualifyingMs = owned ? values[4] : values[3];
      return rows
        .filter((row) => {
          if (row.type !== type) return false;
          if (owned ? row.userId !== ownerId : row.userId != null) return false;
          if (!row.meta || row.meta.visitorId !== visitorId) return false;
          if (!row.meta || row.meta.outcome !== outcome) return false;
          if (sql.includes('qualifyingMs') && row.meta.qualifyingMs !== qualifyingMs) return false;
          return true;
        })
        .map((row) => ({ id: row.id }));
    },
    event: {
      async create({ data }) {
        const row = { id: `e${nextId}`, createdAt: new Date().toISOString(), ...data };
        nextId += 1;
        rows.push(row);
        return row;
      },
    },
  };
}

function attachAnonymous(rows, userId, visitorId) {
  for (const row of rows) {
    if (row.userId == null && row.meta && row.meta.visitorId === visitorId) row.userId = userId;
  }
}

async function readToGate(prisma) {
  let state = freshAllowanceState(0);
  const record = async (previous, next, extra) => {
    const facts = [];
    if (extra.decline === true && previous.exhausted && !previous.gatePersisted) {
      const gate = serverGateFact(previous);
      if (gate) facts.push(gate);
    }
    const plan = planAllowanceRecord(previous, next, extra);
    if (plan) facts.push(plan);
    for (const fact of facts) {
      const saved = await recordReadingAllowanceFact(prisma, fact, null);
      assert.equal(saved.ok, true);
      if (!saved.duplicate) state = markAllowanceRecorded(state, fact.outcome);
    }
  };

  let now = 0;
  let previous = state;
  state = applyReadingTick(state, {
    now,
    limitMs: LIMIT,
    active: true,
    chapterId: '1',
    page: 1,
    visitorId: VISITOR,
  });
  await record(previous, state, { decline: false });

  for (now = 2_000; now <= 40_000; now += 2_000) {
    previous = state;
    state = applyReadingTick(state, {
      now,
      limitMs: LIMIT,
      active: true,
      chapterId: '1',
      page: 2,
      visitorId: VISITOR,
    });
    await record(previous, state, { decline: false });
  }
  for (now = 42_000; now <= 90_000; now += 2_000) {
    previous = state;
    state = applyReadingTick(state, {
      now,
      limitMs: LIMIT,
      active: true,
      chapterId: '2',
      page: 4,
      visitorId: VISITOR,
    });
    await record(previous, state, { decline: false });
  }
  return state;
}

function lead(extra = {}) {
  return {
    capturedAt: '2026-10-15T16:00:00.000Z',
    captureSurface: 'landing',
    visitorId: VISITOR,
    channel: 'unknown',
    ref: 'friend-code',
    ...extra,
  };
}

function engagementFrom(rows, extraEvents = []) {
  return classifyProspectEngagement({
    leadAttribution: lead(),
    events: [...rows, ...extraEvents],
  });
}

async function main() {
  const prisma = fakePrisma();
  const creates = [];
  const originalCreate = prisma.event.create.bind(prisma.event);
  prisma.event.create = async (args) => {
    creates.push(args.data.type);
    return originalCreate(args);
  };

  const state = await readToGate(prisma);
  assert.equal(state.exhausted, true);
  assert.equal(state.accumulatedMs, LIMIT);
  assert.equal(state.chapterMs['1'] + state.chapterMs['2'], LIMIT);
  assert.ok(state.chapterMs['1'] > 0);
  assert.ok(state.chapterMs['2'] > 0);
  assert.equal(state.gatePersisted, true);

  const snapshots = prisma.rows.filter((row) => row.type === 'READING_ALLOWANCE_RECORDED');
  assert.equal(snapshots.length, 5, 'a 90-second read stores a snapshot about every 15 seconds, not every heartbeat');
  const gateRows = prisma.rows.filter((row) => row.type === 'READING_GATE_REACHED');
  assert.equal(gateRows.length, 1);
  const beforeAttach = gateRows.length;
  await recordReadingAllowanceFact(prisma, {
    outcome: 'gate_reached',
    visitorId: VISITOR,
    qualifyingMs: LIMIT,
    chapterMs: state.chapterMs,
    chapterId: '2',
    page: 4,
  });
  assert.equal(prisma.rows.filter((row) => row.type === 'READING_GATE_REACHED').length, beforeAttach);
  const gateAgainForUser = await recordReadingAllowanceFact(prisma, {
    outcome: 'gate_reached',
    visitorId: VISITOR,
    qualifyingMs: LIMIT,
    chapterMs: state.chapterMs,
    chapterId: '2',
    page: 4,
  }, 'reader-1');
  assert.equal(gateAgainForUser.duplicate, true);
  assert.equal(prisma.rows.filter((row) => row.type === 'READING_GATE_REACHED').length, 1);
  const sameSnapshot = snapshots[0];
  const snapshotAgain = await recordReadingAllowanceFact(prisma, {
    outcome: 'snapshot',
    visitorId: VISITOR,
    qualifyingMs: sameSnapshot.meta.qualifyingMs,
    chapterMs: {
      1: sameSnapshot.meta.chapterMs1,
      2: sameSnapshot.meta.chapterMs2,
      9: sameSnapshot.meta.chapterMs9,
      45: sameSnapshot.meta.chapterMs45,
    },
    chapterId: '1',
    page: 1,
  });
  assert.equal(snapshotAgain.duplicate, true);

  const token = signAllowanceState(state);
  assert.ok(token.length < 2000);
  const roundTrip = readAllowanceToken(token, 1_000);
  assert.equal(roundTrip.state.chapterMs['1'], state.chapterMs['1']);
  assert.equal(roundTrip.state.chapterMs['2'], state.chapterMs['2']);
  assert.equal(roundTrip.state.gatePersisted, true);

  const shown = publicAllowance(state, LIMIT);
  assert.equal(shown.chapterMs, undefined);
  assert.equal(shown.qualifyingMs, undefined);
  assert.equal(shown.exhausted, true);
  assert.equal(shown.remainingMs, 0);

  const before = classifyProspectEngagement({
    leadAttribution: lead(),
    events: [
      {
        type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
        userId: null,
        createdAt: '2026-10-15T16:00:00.000Z',
        meta: { chapterId: '1', secondsOnPage: 40 },
      },
      {
        type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
        userId: null,
        createdAt: '2026-10-15T16:02:00.000Z',
        meta: { chapterId: '2', secondsOnPage: 50 },
      },
      {
        type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
        userId: 'reader-1',
        createdAt: '2026-10-15T16:05:00.000Z',
        meta: { source: 'server', visitorId: VISITOR },
      },
    ],
  });

  const acceptance = emailAcceptanceFact(state);
  assert.equal(acceptance.qualifyingMs, LIMIT);
  const emailSaved = await recordReadingAllowanceFact(prisma, acceptance, 'reader-1');
  assert.equal(emailSaved.duplicate, false);
  const emailAgain = await recordReadingAllowanceFact(prisma, acceptance, 'reader-1');
  assert.equal(emailAgain.duplicate, true);
  assert.equal(prisma.rows.filter((row) => row.type === 'READING_GATE_EMAIL_ACCEPTED').length, 1);

  attachAnonymous(prisma.rows, 'reader-1', VISITOR);
  assert.ok(prisma.rows.every((row) => row.userId === 'reader-1'));
  assert.equal(prisma.rows.filter((row) => row.type === 'READING_GATE_REACHED').length, 1);
  for (const row of prisma.rows) row.createdAt = '2026-10-15T16:00:00.000Z';

  const keptOpens = {
    type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
    userId: 'reader-1',
    createdAt: '2026-10-15T16:00:00.000Z',
    meta: { chapterId: '1' },
  };
  const keptRetailer = {
    type: FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN,
    userId: 'reader-1',
    createdAt: '2026-10-15T23:00:00.000Z',
    meta: { source: 'server', retailerOrigin: 'amazon' },
  };
  const after = engagementFrom(prisma.rows, [
    {
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
      userId: 'reader-1',
      createdAt: '2026-10-15T16:05:00.000Z',
      meta: { source: 'server', visitorId: VISITOR, ref: 'friend-code' },
    },
    keptOpens,
    keptRetailer,
  ]);

  assert.equal(before.engagement, ENGAGEMENT.IDENTIFIED);
  assert.equal(before.sampleEngaged, false);
  assert.equal(before.qualifyingMs, 0);
  assert.equal(after.engagement, ENGAGEMENT.RETAILER_RETURN_ENGAGED);
  assert.equal(after.sampleEngaged, true);
  assert.equal(after.qualifyingMs, LIMIT);
  assert.equal(after.gateReached, true);
  assert.equal(after.gateEmailAccepted, true);
  assert.equal(after.notNow, false);
  assert.ok(after.chaptersSampled.includes('1'));
  assert.ok(after.chaptersSampled.includes('2'));
  assert.equal(after.qualifyingByChapter['1'] > 0, true);
  assert.equal(after.qualifyingByChapter['2'] > 0, true);
  assert.equal(after.activity.measuredSessionCount, null);
  assert.equal(after.activity.sessionMeasurement, 'unavailable_no_session_id');
  assert.equal(after.activity.inferredReturnCount, 1);
  assert.equal(after.retailerOrigin, 'amazon');

  const close = classifyProspectEngagement({
    leadAttribution: lead(),
    events: [
      { type: 'READING_ALLOWANCE_RECORDED', createdAt: '2026-10-15T16:00:00.000Z', meta: { allowanceSource: 'server_allowance', outcome: 'snapshot', qualifyingMs: 15_000, chapterMs1: 15_000, chapterMs2: 0, chapterMs9: 0, chapterMs45: 0 } },
      { type: 'READING_ALLOWANCE_RECORDED', createdAt: '2026-10-15T16:05:00.000Z', meta: { allowanceSource: 'server_allowance', outcome: 'snapshot', qualifyingMs: 30_000, chapterMs1: 30_000, chapterMs2: 0, chapterMs9: 0, chapterMs45: 0 } },
    ],
  });
  assert.equal(close.activity.inferredReturnCount, 0);
  assert.equal(close.activity.measuredSessionCount, null);
  assert.equal(close.sampleEngaged, false);

  const anonymousGate = prisma.rows.find((row) => row.type === 'READING_GATE_REACHED');
  const selected = selectProspectEngagementEvents(
    [{ ...anonymousGate, userId: null }, { ...anonymousGate, userId: 'someone-else' }],
    { userId: 'reader-1', visitorIds: new Set([VISITOR]) },
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0].userId, null);

  const rejected = await recordFunnelEvent(
    { event: { create() { throw new Error('public recorder must not insert a private allowance fact'); } } },
    { type: 'READING_ALLOWANCE_RECORDED', meta: { allowanceSource: 'server_allowance', qualifyingMs: LIMIT } },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'invalid_event_type');

  for (const type of ['READING_ALLOWANCE_RECORDED', 'READING_GATE_REACHED', 'READING_GATE_NOT_NOW', 'READING_GATE_EMAIL_ACCEPTED']) {
    assert.equal(Object.values(FUNNEL_EVENT_TYPES).includes(type), false);
    assert.equal(PROSPECT_ENGAGEMENT_EVENT_TYPES.includes(type), true);
  }
  for (const kept of [
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
    FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN,
    FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
  ]) {
    assert.equal(PROSPECT_ENGAGEMENT_EVENT_TYPES.includes(kept), true);
  }

  const purchaser = classifyReader({
    userId: 'reader-1',
    email: 'buyer@example.net',
    profile: { readerType: 'purchased', source: 'Website', status: 'active' },
    purchases: [{ sessionId: 'cs_live_1', saleStatus: 'live', purchasedAt: '2026-08-01' }],
  });
  assert.equal(purchaser.ownership, OWNERSHIP.PURCHASER);
  assert.equal(purchaser.nurtureSuppressed, true);
  assert.equal(after.sampleEngaged, true);

  const gifted = classifyReader({
    email: 'gift@example.net',
    profile: { readerType: 'gifted', source: 'Gift', status: 'active' },
    evidence: [{
      kind: 'gift_book_owner',
      status: 'confirmed',
      sourceLabel: 'gift',
      purchaseDate: null,
      details: null,
    }],
  });
  assert.equal(gifted.ownership, OWNERSHIP.BOOK_OWNER_GIFTED);
  assert.equal(gifted.nurtureSuppressed, true);

  const snapshot = buildLeadAttributionSnapshot({
    visitorId: VISITOR,
    captureSurface: 'landing',
    ref: 'friend-code',
    code: 'REF123',
  });
  assert.equal(snapshot.ref, 'friend-code');
  assert.equal(snapshot.code, 'REF123');
  assert.equal(snapshot.enrolledAt, undefined);

  let early = freshAllowanceState(0);
  early = applyReadingTick(early, { now: 0, limitMs: LIMIT, active: true, chapterId: '9', visitorId: VISITOR });
  early = applyReadingTick(early, { now: 2_000, limitMs: LIMIT, active: true, chapterId: '9', visitorId: VISITOR });
  const declined = applyReadingTick(early, { now: 2_000, limitMs: LIMIT, decline: true, chapterId: '9', visitorId: VISITOR });
  assert.equal(serverGateFact(declined), null);
  assert.equal(emailAcceptanceFact(declined).qualifyingMs, 2_000);
  const notNow = planAllowanceRecord(early, declined, { decline: true });
  const notNowSaved = await recordReadingAllowanceFact(prisma, notNow, null);
  assert.equal(notNowSaved.duplicate, false);
  const notNowAgain = await recordReadingAllowanceFact(prisma, notNow, null);
  assert.equal(notNowAgain.duplicate, true);

  const routeSrc = fs.readFileSync(path.join(__dirname, '../api/sampleChapters/readingAllowance.cjs'), 'utf8');
  const leadSrc = fs.readFileSync(path.join(__dirname, '../api/readersAgree/lead.cjs'), 'utf8');
  const factSrc = fs.readFileSync(path.join(__dirname, '../lib/readers/recordReadingAllowanceFact.cjs'), 'utf8');
  for (const src of [routeSrc, leadSrc, factSrc]) {
    assert.doesNotMatch(src, /prospectNurtureEnrolledAt/);
    assert.doesNotMatch(src, /trySendProspectNurture|send-prospect-nurture|sendEmail/);
    assert.doesNotMatch(src, /emailMarketingConsentAt\s*:/);
  }
  assert.match(leadSrc, /consentAccepted === true/);

  const example = {
    before: {
      engagement: before.engagement,
      sampleEngaged: before.sampleEngaged,
      qualifyingMs: before.qualifyingMs,
      qualifyingByChapter: before.qualifyingByChapter,
      gateReached: before.gateReached,
      gateEmailAccepted: before.gateEmailAccepted,
    },
    after: {
      engagement: after.engagement,
      sampleEngaged: after.sampleEngaged,
      qualifyingMs: after.qualifyingMs,
      qualifyingByChapter: after.qualifyingByChapter,
      chaptersSampled: after.chaptersSampled,
      gateReached: after.gateReached,
      gateEmailAccepted: after.gateEmailAccepted,
      notNow: after.notNow,
      retailerOrigin: after.retailerOrigin,
      activity: after.activity,
      reasons: after.reasons,
    },
  };
  console.log(JSON.stringify({ pass: true, example }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
