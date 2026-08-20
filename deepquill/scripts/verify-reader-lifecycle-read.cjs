#!/usr/bin/env node
/**
 * Synthetic read-only checks for readerLifecycleRead.cjs.
 * Uses DATABASE_URL on a disposable SQLite file. Refuses deepquill/dev.db.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const {
  listReaderLifecycle,
  getReaderLifecycleDetail,
  listReviewQueue,
  listCommunicationActivity,
  listPurchasesWithoutReaderProfile,
  asReadOnlyPrisma,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  CONTACTABILITY_SCOPE,
  CONTACTABLE_MEANS,
  WRITE_METHODS,
  RAW_CLIENT_METHODS,
} = require('../lib/readers/readerLifecycleRead.cjs');

const url = process.env.DATABASE_URL || '';
const normalized = url.replace(/\\/g, '/').toLowerCase();
if (!url.startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
  throw new Error('Refusing to run against the normal local deepquill/dev.db');
}

const prisma = new PrismaClient();
const ACTOR = { actorType: 'admin', actorLabel: 'Kris' };
let failed = 0;
let passed = 0;

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

function actorEvidence(extra) {
  return {
    reason: extra.reason || 'synthetic_test',
    origin: extra.origin || 'test',
    originRef: extra.originRef,
    ...ACTOR,
    ...extra,
  };
}

async function counts() {
  const [users, profiles, purchases, evidence, comms, reviews, decisions, audits] = await Promise.all([
    prisma.user.count(),
    prisma.readerProfile.count(),
    prisma.purchase.count(),
    prisma.readerEvidence.count(),
    prisma.readerCommunication.count(),
    prisma.readerIdentityReview.count(),
    prisma.readerContactDecision.count(),
    prisma.readerAdminAudit.count(),
  ]);
  return { users, profiles, purchases, evidence, comms, reviews, decisions, audits };
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

function normalizeRows(rows) {
  return rows
    .map((row) => canonicalize(row))
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

async function snapshotTables() {
  const tables = {
    User: await prisma.user.findMany(),
    ReaderProfile: await prisma.readerProfile.findMany(),
    Purchase: await prisma.purchase.findMany(),
    ReaderEvidence: await prisma.readerEvidence.findMany(),
    ReaderCommunication: await prisma.readerCommunication.findMany(),
    ReaderIdentityReview: await prisma.readerIdentityReview.findMany(),
    ReaderContactDecision: await prisma.readerContactDecision.findMany(),
    ReaderAdminAudit: await prisma.readerAdminAudit.findMany(),
  };
  const normalized = {};
  const rowCounts = {};
  for (const [name, rows] of Object.entries(tables)) {
    normalized[name] = normalizeRows(rows);
    rowCounts[name] = normalized[name].length;
  }
  const json = JSON.stringify(normalized);
  return {
    hash: crypto.createHash('sha256').update(json).digest('hex'),
    rowCounts,
    byteLength: Buffer.byteLength(json),
  };
}

async function paginateSearch(q, pageSize) {
  const ids = [];
  const scannedFlags = [];
  let cursor;
  let pages = 0;
  let lastPartial = false;
  do {
    const page = await listReaderLifecycle(prisma, { q, pageSize, cursor });
    pages += 1;
    lastPartial = Boolean(page.partial);
    assert.strictEqual(page.totalCount, null);
    for (const item of page.items) ids.push(item.readerProfileId);
    scannedFlags.push(page.scanned);
    cursor = page.nextCursor;
    if (pages > 40) throw new Error(`search pagination did not terminate for q=${q}`);
  } while (cursor);
  return { ids, pages, partial: lastPartial, scannedFlags };
}

async function seed() {
  const special = {};

  special.website = await prisma.user.create({
    data: {
      email: 'special-website@example.net',
      code: 'spweb',
      referralCode: 'SPWEB',
      fname: 'Web',
      lname: 'Buyer',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
      purchases: {
        create: { sessionId: 'cs_web_1', amount: 2499, currency: 'usd', source: 'stripe', saleStatus: 'live' },
      },
    },
    include: { readerProfile: true },
  });

  special.jeff = await prisma.user.create({
    data: {
      email: 'Jeff.Reader@Example.NET',
      code: 'spjeff',
      referralCode: 'SPJEFF',
      fname: 'Jeff',
      firstName: 'Jeff',
      lname: 'Reader',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });

  special.bn = await prisma.user.create({
    data: {
      email: 'special-bn@example.net',
      code: 'spbn',
      referralCode: 'SPBN',
      fname: 'Barnes',
      lname: 'Noble',
      readerProfile: { create: { source: 'Barnes & Noble', readerType: 'purchased', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.bn.id,
      kind: 'kris_personal_knowledge',
      status: 'provisional',
      sourceLabel: 'Barnes & Noble',
      purchaseDate: new Date('2026-08-10'),
      details: 'Kris personal knowledge',
      originRef: 'bn-1',
    }),
  });

  special.multi = await prisma.user.create({
    data: {
      email: 'special-multi@example.net',
      code: 'spmulti',
      referralCode: 'SPMULTI',
      fname: 'Multi',
      lname: 'Source',
      readerProfile: { create: { source: 'Website', readerType: 'purchased', status: 'active' } },
      purchases: {
        create: { sessionId: 'cs_multi_1', amount: 2499, currency: 'usd', source: 'stripe', saleStatus: 'live' },
      },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.multi.id,
      kind: 'manual_bn',
      status: 'confirmed',
      sourceLabel: 'Barnes & Noble',
      purchaseDate: new Date('2026-06-01'),
      details: 'signing copy',
      originRef: 'multi-bn',
    }),
  });

  special.amazon = await prisma.user.create({
    data: {
      email: 'special-amazon@example.net',
      code: 'spaz',
      referralCode: 'SPAZ',
      fname: 'Amazon',
      lname: 'Reader',
      readerProfile: { create: { source: 'Amazon', readerType: 'purchased', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.amazon.id,
      kind: 'manual_amazon',
      status: 'confirmed',
      sourceLabel: 'Amazon',
      purchaseDate: new Date('2026-07-01'),
      details: 'order email',
      originRef: 'az-1',
    }),
  });

  special.gift = await prisma.user.create({
    data: {
      email: 'special-gift@example.net',
      code: 'spgift',
      referralCode: 'SPGIFT',
      fname: 'Gift',
      lname: 'Owner',
      readerProfile: { create: { source: 'Gift', readerType: 'gifted', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.gift.id,
      kind: 'gift_book_owner',
      status: 'confirmed',
      purchaseDate: new Date('2026-04-01'),
      details: 'gifted at event',
      originRef: 'gift-1',
    }),
  });

  special.archived = await prisma.user.create({
    data: {
      email: 'special-archived@example.net',
      code: 'sparch',
      referralCode: 'SPARCH',
      fname: 'Archived',
      lname: 'Beta',
      readerProfile: { create: { source: 'Website', readerType: 'purchased', status: 'active' } },
      purchases: {
        create: { sessionId: 'cs_beta_1', amount: 0, currency: 'usd', source: 'stripe', saleStatus: 'archived_beta' },
      },
    },
    include: { readerProfile: true },
  });

  special.legacy = await prisma.user.create({
    data: {
      email: 'special-legacy@example.net',
      code: 'spleg',
      referralCode: 'SPLEG',
      fname: 'Legacy',
      lname: 'Purchased',
      readerProfile: { create: { source: null, readerType: 'purchased', status: 'active' } },
    },
    include: { readerProfile: true },
  });

  special.openReview = await prisma.user.create({
    data: {
      email: 'special-openreview@example.net',
      code: 'spopen',
      referralCode: 'SPOPEN',
      fname: 'Open',
      lname: 'Review',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerIdentityReview.create({
    data: {
      primaryUserId: special.openReview.id,
      reasonCode: 'duplicate_name',
      status: 'open',
      details: 'possible duplicate',
      ...ACTOR,
    },
  });

  special.resolvedReview = await prisma.user.create({
    data: {
      email: 'special-resolved@example.net',
      code: 'spres',
      referralCode: 'SPRES',
      fname: 'Resolved',
      lname: 'Review',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerIdentityReview.create({
    data: {
      primaryUserId: special.resolvedReview.id,
      reasonCode: 'duplicate_name',
      status: 'resolved_keep_separate',
      resolutionReason: 'different people',
      resolvedAt: new Date(),
      ...ACTOR,
    },
  });

  special.superseded = await prisma.user.create({
    data: {
      email: 'special-superseded@example.net',
      code: 'spsup',
      referralCode: 'SPSUP',
      fname: 'Super',
      lname: 'Seded',
      readerProfile: { create: { source: 'Amazon', readerType: 'purchased', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  const currentEv = await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.superseded.id,
      kind: 'manual_amazon',
      status: 'confirmed',
      sourceLabel: 'Amazon',
      purchaseDate: new Date('2026-07-02'),
      details: 'current',
      originRef: 'sup-current',
    }),
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.superseded.id,
      kind: 'manual_amazon',
      status: 'superseded',
      sourceLabel: 'Amazon',
      details: 'old wrong date',
      supersededById: currentEv.id,
      originRef: 'sup-old',
    }),
  });

  special.disputed = await prisma.user.create({
    data: {
      email: 'special-disputed@example.net',
      code: 'spdisp',
      referralCode: 'SPDISP',
      fname: 'Disputed',
      lname: 'Case',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.disputed.id,
      kind: 'manual_amazon',
      status: 'disputed',
      sourceLabel: 'Amazon',
      originRef: 'disp-1',
    }),
  });

  special.aggregate = await prisma.user.create({
    data: {
      email: 'special-agg@example.net',
      code: 'spagg',
      referralCode: 'SPAGG',
      fname: 'Agg',
      lname: 'Report',
      readerProfile: { create: { source: 'Amazon', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.aggregate.id,
      kind: 'aggregate_marketing_not_individual',
      status: 'confirmed',
      details: 'campaign total',
      originRef: 'agg-1',
    }),
  });

  special.dnc = await prisma.user.create({
    data: {
      email: 'special-dnc@example.net',
      code: 'spdnc',
      referralCode: 'SPDNC',
      fname: 'DoNot',
      lname: 'Contact',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerContactDecision.create({
    data: {
      userId: special.dnc.id,
      decision: 'suppress',
      reason: 'asked to stop',
      origin: 'admin_decision',
      originRef: 'dnc-suppress',
      ...ACTOR,
    },
  });
  await prisma.readerContactDecision.create({
    data: {
      userId: special.dnc.id,
      decision: 'allow',
      reason: 'asked to resume',
      origin: 'admin_decision',
      originRef: 'dnc-allow',
      ...ACTOR,
    },
  });

  special.dncHold = await prisma.user.create({
    data: {
      email: 'special-dnchold@example.net',
      code: 'spdnhold',
      referralCode: 'SPDNHOLD',
      fname: 'Still',
      lname: 'Suppressed',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerContactDecision.create({
    data: {
      userId: special.dncHold.id,
      decision: 'suppress',
      reason: 'dnc remains',
      origin: 'admin_decision',
      originRef: 'dnc-hold',
      ...ACTOR,
    },
  });

  await prisma.readerCommunication.create({
    data: {
      userId: special.website.id,
      recipientEmailSnapshot: special.website.email,
      category: 'reader_recommendation_taf',
      templateOrAskId: 'taf_ask_1',
      trigger: 'unknown',
      occurredAt: new Date('2026-06-01T12:00:00Z'),
      outcome: 'recorded_sent_delivery_unknown',
      source: 'user_stamp',
      sourceRef: `${special.website.id}:taf`,
      caption: 'Inferred historical TAF ask #1',
    },
  });
  await prisma.readerCommunication.create({
    data: {
      userId: special.website.id,
      recipientEmailSnapshot: special.website.email,
      category: 'purchase_confirmation',
      trigger: 'webhook',
      occurredAt: new Date('2026-08-01T12:00:00Z'),
      outcome: 'accepted',
      source: 'ledger',
      sourceRef: `${special.website.id}:confirm`,
      caption: 'Purchase confirmation recorded',
    },
  });

  special.noProfile = await prisma.user.create({
    data: {
      email: 'special-noprofile@example.net',
      code: 'spnoprof',
      referralCode: 'SPNOPROF',
      fname: 'No',
      lname: 'Profile',
      purchases: {
        create: { sessionId: 'cs_noprof_1', amount: 1999, currency: 'usd', source: 'stripe', saleStatus: 'live' },
      },
    },
  });

  const existing = await prisma.readerProfile.count();
  const needed = 520 - existing;
  for (let i = 0; i < needed; i += 1) {
    const n = String(i).padStart(4, '0');
    await prisma.user.create({
      data: {
        email: `pad-${n}@example.net`,
        code: `pad${n}`,
        referralCode: `PAD${n}`,
        fname: 'Pad',
        lname: n,
        readerProfile: {
          create: { source: 'Website', readerType: 'interested', status: 'active', notes: 'padding' },
        },
      },
    });
  }

  return special;
}

function auditSourceReadOnly() {
  const src = fs.readFileSync(path.join(__dirname, '../lib/readers/readerLifecycleRead.cjs'), 'utf8');
  const forbidden = src.match(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g) || [];
  assert.strictEqual(
    forbidden.length,
    0,
    `service source contains write-like calls: ${forbidden.join(', ')}`,
  );
  const rawCalls = src.match(/\$(?:execute|query)Raw(?:Unsafe)?\s*[\(`]/g) || [];
  assert.strictEqual(rawCalls.length, 0, `service source contains raw calls: ${rawCalls.join(', ')}`);
}

async function assertReadOnlyWrapperBlocks() {
  const db = asReadOnlyPrisma(prisma);
  async function mustThrow(label, fn) {
    let error = null;
    try {
      await fn();
    } catch (err) {
      error = err;
    }
    assert.ok(error, `${label} should throw`);
    assert.match(String(error.message), /read-only prisma/i, `${label} threw unexpected: ${error.message}`);
  }

  await mustThrow('$executeRaw', () => db.$executeRaw`SELECT 1`);
  await mustThrow('$executeRawUnsafe', () => db.$executeRawUnsafe('SELECT 1'));
  await mustThrow('$queryRaw', () => db.$queryRaw`SELECT 1`);
  await mustThrow('$queryRawUnsafe', () => db.$queryRawUnsafe('SELECT 1'));
  await mustThrow('executeRaw', () => db.executeRaw());
  await mustThrow('queryRaw', () => db.queryRaw());

  const data = { email: 'blocked@example.net' };
  await mustThrow('user.create', () => db.user.create({ data }));
  await mustThrow('user.createMany', () => db.user.createMany({ data: [data] }));
  await mustThrow('user.update', () => db.user.update({ where: { id: 'missing' }, data }));
  await mustThrow('user.updateMany', () => db.user.updateMany({ data: { fname: 'x' } }));
  await mustThrow('user.upsert', () => db.user.upsert({ where: { id: 'missing' }, create: data, update: data }));
  await mustThrow('user.delete', () => db.user.delete({ where: { id: 'missing' } }));
  await mustThrow('user.deleteMany', () => db.user.deleteMany({ where: { email: 'blocked@example.net' } }));

  assert.ok(WRITE_METHODS.includes('createMany'));
  assert.ok(RAW_CLIENT_METHODS.includes('$queryRawUnsafe'));
}

async function paginateAll() {
  const ids = [];
  let cursor;
  let pages = 0;
  do {
    const page = await listReaderLifecycle(prisma, { pageSize: 100, cursor });
    pages += 1;
    for (const item of page.items) ids.push(item.readerProfileId);
    cursor = page.nextCursor;
    if (pages > 20) throw new Error('pagination did not terminate');
  } while (cursor);
  return ids;
}

async function main() {
  auditSourceReadOnly();
  console.log('ok  service source has no write calls');

  const special = await seed();
  const before = await counts();
  const beforeSnap = await snapshotTables();
  assert.ok(before.profiles > 500, `expected >500 profiles, got ${before.profiles}`);
  console.log(`seeded profiles=${before.profiles} snapshot=${beforeSnap.hash}`);

  await check('read-only prisma rejects raw and write methods', async () => {
    await assertReadOnlyWrapperBlocks();
  });

  await check('page size defaults to 50', async () => {
    const page = await listReaderLifecycle(prisma, {});
    assert.strictEqual(page.pageSize, DEFAULT_PAGE_SIZE);
    assert.strictEqual(page.items.length, 50);
  });

  await check('page size caps at 100', async () => {
    const page = await listReaderLifecycle(prisma, { pageSize: 500 });
    assert.strictEqual(page.pageSize, MAX_PAGE_SIZE);
    assert.strictEqual(page.items.length, 100);
  });

  await check('complete pagination over 500 profiles has no duplicate IDs', async () => {
    const ids = await paginateAll();
    assert.ok(ids.length > 500, `paged ${ids.length}`);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.strictEqual(ids.length, before.profiles);
  });

  await check('search finds B&N special reader', async () => {
    const page = await listReaderLifecycle(prisma, { q: 'Barnes', pageSize: 20 });
    assert.ok(page.items.some((row) => row.userId === special.bn.id));
  });

  await check('search is case-insensitive for name and email', async () => {
    const queries = ['jeff', 'JEFF', 'Jeff', 'jeff reader', 'JEFF READER'];
    for (const q of queries) {
      const page = await listReaderLifecycle(prisma, { q, pageSize: 20 });
      assert.ok(
        page.items.some((row) => row.userId === special.jeff.id),
        `q=${q} should find Jeff`,
      );
      assert.strictEqual(page.totalCount, null);
      assert.strictEqual(page.partial, false);
    }
    const emails = ['jeff.reader@example.net', 'JEFF.READER@EXAMPLE.NET', 'Jeff.Reader@Example.NET'];
    for (const q of emails) {
      const page = await listReaderLifecycle(prisma, { q, pageSize: 20 });
      assert.ok(
        page.items.some((row) => row.userId === special.jeff.id),
        `email q=${q} should find Jeff`,
      );
    }
    const last = await listReaderLifecycle(prisma, { q: 'reader', pageSize: 50 });
    assert.ok(last.items.some((row) => row.userId === special.jeff.id));
    assert.ok(last.items.some((row) => row.userId === special.amazon.id));
  });

  await check('search pagination has no duplicates or skipped pad matches', async () => {
    const lower = await paginateSearch('pad', 50);
    const upper = await paginateSearch('PAD', 100);
    assert.ok(lower.ids.length > 400, `expected many pad matches, got ${lower.ids.length}`);
    assert.ok(upper.ids.length > 400, `expected many pad matches, got ${upper.ids.length}`);
    assert.strictEqual(new Set(lower.ids).size, lower.ids.length);
    assert.strictEqual(new Set(upper.ids).size, upper.ids.length);
    assert.strictEqual(lower.ids.length, upper.ids.length);
    assert.deepStrictEqual(lower.ids, upper.ids);
    assert.strictEqual(lower.partial, false);
    assert.strictEqual(upper.partial, false);
    assert.ok(!lower.ids.includes(special.jeff.readerProfile.id));
  });

  await check('derived purchaser filter includes website, amazon, bn, multi-source', async () => {
    const page = await listReaderLifecycle(prisma, { ownership: 'purchaser', pageSize: 100 });
    const ids = new Set(page.items.map((row) => row.userId));
    assert.ok(ids.has(special.website.id));
    assert.ok(ids.has(special.amazon.id));
    assert.ok(ids.has(special.bn.id));
    assert.ok(ids.has(special.multi.id));
    const multi = page.items.find((row) => row.userId === special.multi.id);
    assert.deepStrictEqual(multi.sources, ['website', 'barnes_noble']);
    assert.ok(!ids.has(special.gift.id));
    assert.ok(!ids.has(special.legacy.id));
  });

  await check('non-purchaser filter excludes unknown/gifted', async () => {
    const page = await listReaderLifecycle(prisma, { ownership: 'non_purchaser', pageSize: 100 });
    assert.ok(page.items.length > 0);
    assert.ok(page.items.every((row) => row.ownership === 'non_purchaser'));
    assert.ok(!page.items.some((row) => ['unknown', 'book_owner_gifted', 'purchaser'].includes(row.ownership)));
    const agg = await listReaderLifecycle(prisma, {
      ownership: 'non_purchaser',
      q: 'special-agg@example.net',
      pageSize: 10,
    });
    assert.ok(agg.items.some((row) => row.userId === special.aggregate.id));
    const gift = await listReaderLifecycle(prisma, {
      ownership: 'non_purchaser',
      q: 'special-gift@example.net',
      pageSize: 10,
    });
    assert.ok(!gift.items.some((row) => row.userId === special.gift.id));
    const legacy = await listReaderLifecycle(prisma, {
      ownership: 'non_purchaser',
      q: 'special-legacy@example.net',
      pageSize: 10,
    });
    assert.ok(!legacy.items.some((row) => row.userId === special.legacy.id));
  });

  await check('confidence filter', async () => {
    const page = await listReaderLifecycle(prisma, { confidence: 'provisional', pageSize: 50 });
    assert.ok(page.items.some((row) => row.userId === special.bn.id));
    assert.ok(page.items.every((row) => row.confidence === 'provisional'));
  });

  await check('contactability uses latest suppress/allow', async () => {
    const allow = await getReaderLifecycleDetail(prisma, { userId: special.dnc.id });
    assert.strictEqual(allow.contactability, 'contactable');
    const hold = await getReaderLifecycleDetail(prisma, { userId: special.dncHold.id });
    assert.strictEqual(hold.contactability, 'suppressed_do_not_contact');
    const filtered = await listReaderLifecycle(prisma, {
      contactability: 'suppressed_do_not_contact',
      pageSize: 50,
    });
    const ids = new Set(filtered.items.map((row) => row.userId));
    assert.ok(ids.has(special.dncHold.id));
    assert.ok(!ids.has(special.dnc.id));
    assert.strictEqual(hold.contactabilityScope.providerSuppressionIntegrated, false);
    assert.strictEqual(hold.contactabilityScope.safeToSend, false);
    assert.strictEqual(hold.contactabilityScope.notForSendingSystems, true);
    assert.strictEqual(hold.contactabilityScope.contactableMeans, CONTACTABLE_MEANS);
    assert.strictEqual(allow.contactabilityScope.safeToSend, false);
    assert.match(CONTACTABLE_MEANS, /No manual DNC and a mailable address/);
    assert.strictEqual(CONTACTABILITY_SCOPE.providerSuppressionIntegrated, false);
    assert.strictEqual(allow.distinctions.notForSendingSystems, true);
    assert.strictEqual(allow.distinctions.safeToSend, false);
  });

  await check('review filter', async () => {
    const page = await listReaderLifecycle(prisma, { review: 'identity_review_required', pageSize: 20 });
    assert.ok(page.items.some((row) => row.userId === special.openReview.id));
  });

  await check('live purchase + interested CRM', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.website.id });
    assert.strictEqual(detail.ownership, 'purchaser');
    assert.deepStrictEqual(detail.sources, ['website']);
    assert.strictEqual(detail.legacy.readerType, 'interested');
    assert.ok(detail.purchases.every((p) => p.accountingTruth));
    assert.ok(!('webhookSecret' in detail.purchases[0]));
    assert.ok(!('client_secret' in detail.purchases[0]));
  });

  await check('provisional B&N evidence', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.bn.id });
    assert.strictEqual(detail.ownership, 'purchaser');
    assert.deepStrictEqual(detail.sources, ['barnes_noble']);
    assert.strictEqual(detail.confidence, 'provisional');
    assert.strictEqual(detail.review, 'incomplete');
  });

  await check('website + B&N', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.multi.id });
    assert.deepStrictEqual(detail.sources, ['website', 'barnes_noble']);
    assert.strictEqual(detail.conflicts.length, 0);
  });

  await check('gift only', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.gift.id });
    assert.strictEqual(detail.ownership, 'book_owner_gifted');
    assert.strictEqual(detail.nurtureSuppressed, true);
  });

  await check('archived beta only', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.archived.id });
    assert.strictEqual(detail.ownership, 'unknown');
    assert.ok(detail.reasons.includes('archived_purchase_only'));
  });

  await check('legacy purchased without evidence', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.legacy.id });
    assert.strictEqual(detail.ownership, 'unknown');
    assert.ok(detail.reasons.includes('legacy_purchased_label_without_evidence'));
  });

  await check('open identity review', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.openReview.id });
    assert.strictEqual(detail.review, 'identity_review_required');
    assert.strictEqual(detail.openReview, true);
  });

  await check('resolved identity review does not hold', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.resolvedReview.id });
    assert.notStrictEqual(detail.review, 'identity_review_required');
    assert.strictEqual(detail.openReview, false);
  });

  await check('superseded evidence visible but excluded from proof', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.superseded.id });
    assert.ok(detail.evidenceHistory.some((row) => row.status === 'superseded'));
    assert.ok(detail.evidenceHistory.some((row) => row.status === 'confirmed'));
    assert.strictEqual(detail.ownership, 'purchaser');
    assert.deepStrictEqual(detail.sources, ['amazon']);
  });

  await check('disputed evidence visible but excluded from proof', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.disputed.id });
    assert.ok(detail.evidenceHistory.some((row) => row.status === 'disputed'));
    assert.strictEqual(detail.ownership, 'non_purchaser');
    assert.strictEqual(detail.review, 'conflicting');
  });

  await check('aggregate never proves purchase', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.aggregate.id });
    assert.strictEqual(detail.ownership, 'non_purchaser');
    assert.deepStrictEqual(detail.sources, []);
  });

  await check('latest communication summary is honest', async () => {
    const detail = await getReaderLifecycleDetail(prisma, { userId: special.website.id });
    assert.strictEqual(detail.latestCommunication.category, 'purchase_confirmation');
    assert.strictEqual(detail.latestCommunication.deliveryKnown, false);
    assert.ok(detail.communications[0].occurredAt >= detail.communications[1].occurredAt);
  });

  await check('detail history ordering is deterministic', async () => {
    const a = await getReaderLifecycleDetail(prisma, { userId: special.website.id });
    const b = await getReaderLifecycleDetail(prisma, { userId: special.website.id });
    assert.deepStrictEqual(a.communications.map((row) => row.id), b.communications.map((row) => row.id));
    assert.deepStrictEqual(a.purchases.map((row) => row.id), b.purchases.map((row) => row.id));
  });

  await check('communication activity filters and pagination', async () => {
    const page = await listCommunicationActivity(prisma, {
      category: 'reader_recommendation_taf',
      pageSize: 10,
    });
    assert.ok(page.items.every((row) => row.category === 'reader_recommendation_taf'));
    const search = await listCommunicationActivity(prisma, { q: 'web', pageSize: 10 });
    assert.ok(search.items.some((row) => row.userId === special.website.id));
    const inferred = await listCommunicationActivity(prisma, { q: 'INFERRED', pageSize: 10 });
    assert.ok(inferred.items.some((row) => /inferred/i.test(row.caption || '')));
    assert.strictEqual(inferred.totalCount, null);
    assert.strictEqual(inferred.partial, false);
  });

  await check('purchase-without-profile queue', async () => {
    const page = await listPurchasesWithoutReaderProfile(prisma, { pageSize: 20 });
    assert.ok(page.items.some((row) => row.userId === special.noProfile.id));
  });

  await check('open identity review queue does not auto-merge', async () => {
    const page = await listReviewQueue(prisma, { kind: 'identity_open', pageSize: 20 });
    assert.ok(page.items.some((row) => row.primaryUserId === special.openReview.id));
    assert.ok(page.items.every((row) => row.automaticMerge === false));
  });

  await check('incomplete and archived-beta review queues', async () => {
    const incomplete = await listReviewQueue(prisma, { kind: 'incomplete', pageSize: 100 });
    assert.ok(incomplete.items.some((row) => row.userId === special.bn.id));
    const archived = await listReviewQueue(prisma, { kind: 'archived_beta_only', pageSize: 20 });
    assert.ok(archived.items.some((row) => row.userId === special.archived.id));
    const legacy = await listReviewQueue(prisma, { kind: 'legacy_purchased_without_evidence', pageSize: 20 });
    assert.ok(legacy.items.some((row) => row.userId === special.legacy.id));
  });

  await check('row counts and snapshot hash unchanged after all reads', async () => {
    const after = await counts();
    assert.deepStrictEqual(after, before);
    const afterSnap = await snapshotTables();
    assert.deepStrictEqual(afterSnap.rowCounts, beforeSnap.rowCounts);
    assert.strictEqual(afterSnap.hash, beforeSnap.hash);
    console.log(`    snapshot hash still ${afterSnap.hash}`);
  });

  if (failed) {
    console.error(`\nverify-reader-lifecycle-read: ${failed} failed, ${passed} passed`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nverify-reader-lifecycle-read: ${passed} passed; profiles=${before.profiles}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
