#!/usr/bin/env node
/**
 * Disposable-DB checks for Stage C1 Event assembly + Reader Lifecycle read model.
 * No nurture enrollment or writes. Refuses deepquill/dev.db.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');

function isCanonicalDevDb(url) {
  const raw = String(url || '');
  const normalized = raw.replace(/\\/g, '/').toLowerCase();
  if (!raw) return false;
  if (normalized.includes('/temp/') || normalized.includes('/tmp/')) return false;
  if (normalized.includes('deepquill/dev.db')) return true;
  if (/file:\.?\/?dev\.db$/.test(normalized)) return true;
  try {
    const withoutFile = raw.replace(/^file:/i, '').replace(/\?.*$/, '');
    const resolved = path.resolve(DEEPQUILL_ROOT, withoutFile);
    if (path.resolve(resolved) === path.resolve(DEV_DB)) return true;
  } catch {
    return false;
  }
  return false;
}

function refuseDevDb(url) {
  if (!String(url || '').startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
  if (isCanonicalDevDb(url)) {
    throw new Error('Refusing to run against the normal local deepquill/dev.db');
  }
}

function migrateDisposable() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-c1-engagement-'));
  const dbPath = path.join(tmpDir, 'engagement.db');
  const fileUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  refuseDevDb(fileUrl);
  const prismaCli = path.join(DEEPQUILL_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: DEEPQUILL_ROOT,
    env: { ...process.env, DATABASE_URL: fileUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${(result.stderr || result.stdout || '').slice(-1500)}`);
  }
  return { tmpDir, fileUrl };
}

const disposable = migrateDisposable();
process.env.DATABASE_URL = disposable.fileUrl;
process.env.NODE_ENV = 'test';
delete globalThis.__prisma;

const { PrismaClient } = require('@prisma/client');
const {
  getReaderLifecycleDetail,
  listReaderLifecycle,
  asReadOnlyPrisma,
} = require('../lib/readers/readerLifecycleRead.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');
const {
  ENGAGEMENT,
  REASON,
  B2_TRUE_RESUME_DEPLOYED_AT_ISO,
} = require('../lib/readers/classifyProspectEngagement.cjs');
const POST_B2 = new Date(B2_TRUE_RESUME_DEPLOYED_AT_ISO);
const PRE_B2 = new Date('2026-09-16T16:20:31.692Z');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

let failed = 0;
let passed = 0;
const suffix = `c1${Date.now().toString(36)}`;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`FAIL ${name}: ${err.message}`);
    });
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return String(value);
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  if (value === undefined) return null;
  return value;
}

function raLead(visitorId, extra = {}) {
  return {
    visitorId,
    captureSurface: extra.captureSurface || 'landing',
    capturedAt: extra.capturedAt || '2026-09-16T16:00:00.000Z',
    channel: 'unknown',
    ...extra,
  };
}

function normalizeRows(rows) {
  return rows
    .map((row) => canonicalize(row))
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

async function snapshotSensitive() {
  const tables = {
    User: await prisma.user.findMany(),
    ReaderProfile: await prisma.readerProfile.findMany(),
    Purchase: await prisma.purchase.findMany(),
    ReaderEvidence: await prisma.readerEvidence.findMany(),
    ReaderContactDecision: await prisma.readerContactDecision.findMany(),
    Event: await prisma.event.findMany(),
  };
  const normalized = {};
  for (const [name, rows] of Object.entries(tables)) {
    normalized[name] = normalizeRows(rows);
  }
  const json = JSON.stringify(normalized);
  return {
    hash: crypto.createHash('sha256').update(json).digest('hex'),
    json,
  };
}

async function createUser(key, profileData = {}, extraUser = {}) {
  return prisma.user.create({
    data: {
      email: `${key}-${suffix}@example.net`,
      code: `${key}${suffix}`.slice(0, 24),
      referralCode: `${key}${suffix}`.slice(0, 24).toUpperCase(),
      fname: key,
      ...extraUser,
      readerProfile: {
        create: {
          source: 'readers-agree-v2',
          readerType: 'prospect',
          status: 'active',
          ...profileData,
        },
      },
    },
    include: { readerProfile: true },
  });
}

async function addEvent(userId, type, meta, createdAt) {
  return prisma.event.create({
    data: {
      userId,
      type,
      meta,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

async function main() {
  const identified = await createUser('emailonly', { leadAttribution: raLead('vid-email') });
  await addEvent(identified.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-email',
    retailerOrigin: null,
    captureSurface: 'landing',
  });

  const opener = await createUser('openonly', { leadAttribution: raLead('vid-open') });
  await addEvent(opener.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-open',
  });
  await addEvent(opener.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, {
    visitorId: 'vid-open',
    chapterId: '1',
    source: 'sample-chapter-reader',
  });

  const joined = await createUser('preid', {
    leadAttribution: raLead('vid-preid', { captureSurface: 'bridge' }),
  });
  await addEvent(joined.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-preid',
    retailerOrigin: 'amazon',
    captureSurface: 'bridge',
  });
  await addEvent(
    null,
    FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN,
    {
      visitorId: 'vid-preid',
      retailerOrigin: 'amazon',
      source: 'readers-agree-bridge',
    },
    POST_B2,
  );
  await addEvent(joined.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    visitorId: 'vid-preid',
    chapterId: '1',
    secondsOnPage: 95,
    source: 'sample-chapter-reader',
  });

  const unrelated = await createUser('unrelated', { source: 'Website', readerType: 'interested' });

  const purchaserNoRa = await createUser('buyernora', { source: 'Website', readerType: 'purchased' });
  await prisma.purchase.create({
    data: {
      userId: purchaserNoRa.id,
      sessionId: `cs_live_nora_${suffix}`,
      amount: 2499,
      currency: 'usd',
      source: 'stripe',
      saleStatus: 'live',
    },
  });

  const giftedNoRa = await createUser('giftednora', { source: 'Gift', readerType: 'gifted' });
  await prisma.readerEvidence.create({
    data: {
      userId: giftedNoRa.id,
      kind: 'gift_book_owner',
      status: 'confirmed',
      purchaseDate: new Date('2026-04-01'),
      reason: 'synthetic_test',
      actorType: 'admin',
      actorLabel: 'Kris',
      origin: 'test',
      originRef: `gift-nora-${suffix}`,
    },
  });

  const forgedServer = await createUser('forgedsrc', { source: 'Website', readerType: 'interested' });
  await addEvent(forgedServer.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-forged-server',
    captureSurface: 'landing',
  });
  await addEvent(
    null,
    FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN,
    {
      visitorId: 'vid-forged-server',
      retailerOrigin: 'amazon',
      source: 'readers-agree-bridge',
    },
    POST_B2,
  );
  await addEvent(forgedServer.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    chapterId: '1',
    secondsOnPage: 90,
  });

  const forgedUserId = await createUser('forgeduid', { source: 'Website', readerType: 'interested' });
  await addEvent(forgedUserId.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    chapterId: '1',
    secondsOnPage: 120,
    source: 'sample-chapter-reader',
  });

  const clickOnly = await createUser('clickonly', { leadAttribution: raLead('vid-click') });
  await addEvent(clickOnly.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-click',
    retailerOrigin: 'amazon',
  });
  await addEvent(clickOnly.id, FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK, {
    visitorId: 'vid-click',
    retailerOrigin: 'amazon',
    source: 'readers-agree-bridge',
  });
  await addEvent(clickOnly.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    chapterId: '1',
    secondsOnPage: 90,
  });

  const preB2 = await createUser('preb2', { leadAttribution: raLead('vid-preb2') });
  await addEvent(preB2.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-preb2',
    retailerOrigin: 'amazon',
  });
  await addEvent(
    null,
    FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN,
    {
      visitorId: 'vid-preb2',
      retailerOrigin: 'amazon',
      source: 'readers-agree-bridge',
    },
    PRE_B2,
  );
  await addEvent(preB2.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    visitorId: 'vid-preb2',
    chapterId: '1',
    secondsOnPage: 90,
  });

  const purchaser = await createUser(
    'buyer',
    { source: 'Website', readerType: 'purchased', leadAttribution: raLead('vid-buyer') },
    {
      email: `buyer-${suffix}@example.net`,
    },
  );
  await prisma.purchase.create({
    data: {
      userId: purchaser.id,
      sessionId: `cs_live_${suffix}`,
      amount: 2499,
      currency: 'usd',
      source: 'stripe',
      saleStatus: 'live',
    },
  });
  await addEvent(purchaser.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-buyer',
  });
  await addEvent(purchaser.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    chapterId: '2',
    secondsOnPage: 90,
  });

  const gifted = await createUser('gifted', {
    source: 'Gift',
    readerType: 'gifted',
    leadAttribution: raLead('vid-gift'),
  });
  await prisma.readerEvidence.create({
    data: {
      userId: gifted.id,
      kind: 'gift_book_owner',
      status: 'confirmed',
      purchaseDate: new Date('2026-04-01'),
      reason: 'synthetic_test',
      actorType: 'admin',
      actorLabel: 'Kris',
      origin: 'test',
      originRef: `gift-${suffix}`,
    },
  });
  await addEvent(gifted.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-gift',
  });
  await addEvent(gifted.id, FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED, {
    chapterId: '1',
    source: 'jody-concierge',
  });

  const archived = await createUser('archived', {
    status: 'archived',
    archiveReasonCode: 'other',
    leadAttribution: raLead('vid-arch'),
  });
  await addEvent(archived.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-arch',
  });
  await addEvent(archived.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    chapterId: '1',
    secondsOnPage: 120,
  });

  const dnc = await createUser('dnc', { leadAttribution: raLead('vid-dnc') });
  await prisma.readerContactDecision.create({
    data: {
      userId: dnc.id,
      decision: 'suppress',
      reason: 'synthetic_dnc',
      actorType: 'admin',
      actorLabel: 'Kris',
      origin: 'test',
      originRef: `dnc-${suffix}`,
    },
  });
  await addEvent(dnc.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-dnc',
  });
  await addEvent(dnc.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE, {
    chapterId: '1',
    secondsOnPage: 90,
  });

  const remembered = await createUser('remember', {
    lastCompletedChapterId: '1',
    lastCompletedAt: new Date('2026-09-16T18:00:00.000Z'),
    jodyVerifiedAt: new Date('2026-09-16T18:00:00.000Z'),
    leadAttribution: raLead('vid-remember'),
  });
  await addEvent(remembered.id, FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, {
    source: 'server',
    visitorId: 'vid-remember',
  });

  const enrolledAt = new Date('2026-08-19T18:00:00.000Z');
  const lastSentAt = new Date('2026-08-20T10:00:00.000Z');
  const legacy = [];
  for (let i = 1; i <= 4; i += 1) {
    const row = await createUser(`legacy${i}`, {
      prospectNurtureEnrolledAt: enrolledAt,
      prospectNurtureStep: i === 4 ? 2 : 1,
      prospectNurtureLastSentAt: lastSentAt,
      prospectNurtureSuppressedAt: null,
      prospectNurtureSuppressedReason: null,
      leadAttribution: { visitorId: `legacy-vid-${i}`, captureSurface: 'bridge' },
    });
    legacy.push(row);
  }

  const before = await snapshotSensitive();
  const readOnly = asReadOnlyPrisma(prisma);

  await check('unrelated ReaderProfile has no prospect engagement classification', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: unrelated.id });
    assert.strictEqual(detail.prospectEngagement.engagement, null);
    assert.strictEqual(detail.prospectEngagement.identityAnchor, null);
    assert.deepStrictEqual(detail.prospectEngagement.reasons, []);
  });

  await check('unrelated purchaser is not identified', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: purchaserNoRa.id });
    assert.strictEqual(detail.ownership, 'purchaser');
    assert.strictEqual(detail.nurtureSuppressed, true);
    assert.strictEqual(detail.prospectEngagement.engagement, null);
    assert.strictEqual(detail.legacy.readerType, 'purchased');
  });

  await check('unrelated gifted owner is not identified', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: giftedNoRa.id });
    assert.strictEqual(detail.ownership, 'book_owner_gifted');
    assert.strictEqual(detail.nurtureSuppressed, true);
    assert.strictEqual(detail.prospectEngagement.engagement, null);
  });

  await check('forged meta.source=server Event cannot create the RA identity anchor', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: forgedServer.id });
    assert.strictEqual(detail.prospectEngagement.engagement, null);
    assert.strictEqual(detail.prospectEngagement.retailerReturn, false);
    assert.strictEqual(detail.prospectEngagement.sampleEngaged, false);
  });

  await check('forged bare client userId cannot create the RA identity anchor', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: forgedUserId.id });
    assert.strictEqual(detail.prospectEngagement.engagement, null);
    assert.strictEqual(detail.prospectEngagement.sampleEngaged, false);
  });

  await check('email-only identified is exposed on the read model', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: identified.id });
    assert.strictEqual(detail.ownership, 'non_purchaser');
    assert.strictEqual(detail.nurtureSuppressed, false);
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.IDENTIFIED);
    assert.strictEqual(detail.prospectEngagement.identityAnchor, 'readers_agree_lead_attribution');
    assert.strictEqual(detail.prospectEngagement.analyticsOnly, true);
    assert.strictEqual(detail.prospectEngagement.sampleEngaged, false);
    assert.ok(detail.prospectEngagement.reasons.includes(REASON.EMAIL_CAPTURED));
    assert.doesNotMatch(JSON.stringify(detail.prospectEngagement), /visitorId|secondsOnPage|ap_funnel_uid/);
  });

  await check('chapter open only stays identified on the read model', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: opener.id });
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.IDENTIFIED);
    assert.deepStrictEqual(detail.prospectEngagement.chaptersSampled, ['1']);
    assert.strictEqual(detail.prospectEngagement.sampleEngaged, false);
  });

  await check('pre-identification return joins through leadAttribution visitorId', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: joined.id });
    assert.strictEqual(detail.ownership, 'non_purchaser');
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.RETAILER_RETURN_ENGAGED);
    assert.strictEqual(detail.prospectEngagement.retailerReturn, true);
    assert.strictEqual(detail.prospectEngagement.retailerOrigin, 'amazon');
    assert.strictEqual(detail.prospectEngagement.sampleEngaged, true);
    assert.ok(detail.prospectEngagement.reasons.includes(REASON.RETAILER_RETURN));
  });

  await check('remembered-place qualifies without a 90s Event', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: remembered.id });
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
    assert.ok(detail.prospectEngagement.reasons.includes(REASON.REMEMBERED_PLACE));
    assert.deepStrictEqual(detail.prospectEngagement.chaptersSampled, ['1']);
  });

  await check('click/origin without true return is not retailer-return engaged', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: clickOnly.id });
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
    assert.strictEqual(detail.prospectEngagement.retailerReturn, false);
    assert.ok(!detail.prospectEngagement.reasons.includes(REASON.RETAILER_RETURN));
  });

  await check('pre-B2 RETURN + sample is not retailer-return engaged', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: preB2.id });
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
    assert.strictEqual(detail.prospectEngagement.retailerReturn, false);
    assert.ok(!detail.prospectEngagement.reasons.includes(REASON.RETAILER_RETURN));
  });

  await check('purchaser who samples remains purchaser', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: purchaser.id });
    assert.strictEqual(detail.ownership, 'purchaser');
    assert.strictEqual(detail.nurtureSuppressed, true);
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
    assert.strictEqual(detail.legacy.readerType, 'purchased');
  });

  await check('gifted owner who samples remains gifted', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: gifted.id });
    assert.strictEqual(detail.ownership, 'book_owner_gifted');
    assert.strictEqual(detail.nurtureSuppressed, true);
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  });

  await check('archived reader remains suppressed with informational engagement', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, {
      readerProfileId: archived.readerProfile.id,
    });
    assert.strictEqual(detail.legacy.status, 'archived');
    assert.strictEqual(detail.nurtureSuppressed, true);
    assert.strictEqual(detail.prospectEngagement.sampleEngaged, true);
    assert.strictEqual(detail.primaryQueue, 'archived');
  });

  await check('DNC reader remains suppressed with informational engagement', async () => {
    const detail = await getReaderLifecycleDetail(readOnly, { userId: dnc.id });
    assert.strictEqual(detail.contactability, 'suppressed_do_not_contact');
    assert.strictEqual(detail.nurtureSuppressed, true);
    assert.strictEqual(detail.prospectEngagement.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
    assert.strictEqual(detail.primaryQueue, 'dnc');
  });

  await check('list endpoint includes prospectEngagement without changing queues', async () => {
    const page = await listReaderLifecycle(readOnly, { q: identified.email, pageSize: 20 });
    assert.ok(page.items.length >= 1);
    const item = page.items.find((row) => row.userId === identified.id);
    assert.ok(item);
    assert.strictEqual(item.primaryQueue, 'prospects');
    assert.strictEqual(item.prospectEngagement.engagement, ENGAGEMENT.IDENTIFIED);
  });

  await check('four legacy readers-agree-v2 nurture rows remain untouched', async () => {
    const after = await snapshotSensitive();
    assert.strictEqual(after.hash, before.hash, 'read model wrote lifecycle/event/nurture data');
    for (const row of legacy) {
      const profile = await prisma.readerProfile.findUnique({ where: { id: row.readerProfile.id } });
      assert.strictEqual(profile.source, 'readers-agree-v2');
      assert.strictEqual(profile.readerType, 'prospect');
      assert.ok(profile.prospectNurtureEnrolledAt);
      assert.strictEqual(new Date(profile.prospectNurtureEnrolledAt).toISOString(), enrolledAt.toISOString());
      assert.strictEqual(new Date(profile.prospectNurtureLastSentAt).toISOString(), lastSentAt.toISOString());
      assert.ok(profile.prospectNurtureStep >= 1);
      assert.strictEqual(profile.prospectNurtureSuppressedAt, null);
      const detail = await getReaderLifecycleDetail(readOnly, { readerProfileId: profile.id });
      assert.strictEqual(detail.legacy.source, 'readers-agree-v2');
      assert.ok(detail.prospectEngagement);
      assert.strictEqual(detail.prospectEngagement.engagement, null);
      assert.strictEqual(detail.nurtureSuppressed, false);
    }
  });

  await check('read-only prisma still rejects Event writes', async () => {
    let threw = false;
    try {
      await readOnly.event.create({
        data: { type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, meta: { chapterId: '1' } },
      });
    } catch (err) {
      threw = /read-only prisma/.test(String(err && err.message));
    }
    assert.ok(threw, 'event.create should be blocked');
  });

  if (failed) {
    console.error(`\nverify-prospect-engagement-read: ${failed} failed, ${passed} passed`);
    process.exitCode = 1;
  } else {
    console.log(`\nverify-prospect-engagement-read: ${passed} passed`);
  }

  await prisma.$disconnect();
  fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
