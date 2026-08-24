#!/usr/bin/env node
/**
 * Disposable-DB checks for readerLifecycleWrite.cjs (Checkpoint 5B).
 * Requires DATABASE_URL on a temp SQLite file. Refuses deepquill/dev.db.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const {
  createReaderLifecycleWriteService,
  LifecycleWriteError,
  asMutationGuardedPrisma,
  IDEMPOTENCY_ORIGIN,
  ALLOWED_WRITE_DELEGATES,
} = require('../lib/readers/readerLifecycleWrite.cjs');

const url = process.env.DATABASE_URL || '';
const normalized = url.replace(/\\/g, '/').toLowerCase();
if (!url.startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
  throw new Error('Refusing to run against the normal local deepquill/dev.db');
}

const prisma = new PrismaClient();
const writes = createReaderLifecycleWriteService(prisma);
let failed = 0;
let passed = 0;
const suffix = `cp5b${Date.now()}`;

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

async function expectWriteError(fn, code, httpStatus) {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    if (err.message === `expected ${code}`) throw err;
    assert.strictEqual(err.name, 'LifecycleWriteError', `${err.name}: ${err.message}`);
    assert.strictEqual(err.code, code, err.message);
    if (httpStatus != null) assert.strictEqual(err.httpStatus, httpStatus);
  }
}

function receiptView(result) {
  return {
    warnings: result.warnings,
    completedAt: result.completedAt,
    readerProfileId: result.readerProfileId,
    mutation: result.mutation,
  };
}

function assertNoPiiInJson(value, snippets, label) {
  const text = JSON.stringify(value);
  for (const snippet of snippets) {
    if (!snippet) continue;
    assert.ok(!text.includes(snippet), `${label} leaked ${snippet}`);
  }
}

function collectKeys(value, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      acc.add(key);
      collectKeys(nested, acc);
    }
  }
  return acc;
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  if (value === undefined) return null;
  return value;
}

async function snapshotAccounting() {
  const tables = {
    Purchase: await prisma.purchase.findMany(),
    Order: await prisma.order.findMany(),
    ReferralConversion: await prisma.referralConversion.findMany(),
    ReaderCommunication: await prisma.readerCommunication.findMany(),
    Ledger: await prisma.ledger.findMany(),
  };
  const json = JSON.stringify(
    Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        rows.map(canonicalize).sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''))),
      ]),
    ),
  );
  return {
    hash: crypto.createHash('sha256').update(json).digest('hex'),
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
  };
}

async function createUser(label, extra = {}) {
  const token = `${suffix}${label}`.replace(/[^a-z0-9]/gi, '').slice(0, 20);
  return prisma.user.create({
    data: {
      email: extra.email || `${token}@example.net`,
      code: token,
      referralCode: token.toUpperCase(),
      fname: extra.fname || label,
      lname: extra.lname || 'Reader',
      readerProfile: {
        create: {
          source: extra.source || 'Website',
          readerType: extra.readerType || 'interested',
          status: 'active',
        },
      },
      ...(extra.purchase
        ? {
            purchases: {
              create: extra.purchase,
            },
          }
        : {}),
    },
    include: { readerProfile: true, purchases: true },
  });
}

function evidenceByKind(reader, kind, status) {
  return (reader.evidenceHistory || []).filter(
    (row) => row.kind === kind && (!status || row.status === status),
  );
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

  const tables = (await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  )).map((row) => row.name);
  assert.ok(tables.includes('ReaderMutationIdempotency'), 'missing ReaderMutationIdempotency');

  const helper = await prisma.fulfillmentUser.create({
    data: { name: 'Kris', email: `kris-${suffix}@fulfillment.test`, active: true },
  });
  const resolver = await prisma.fulfillmentUser.create({
    data: { name: 'Denise', email: `denise-${suffix}@fulfillment.test`, active: true },
  });
  const inactive = await prisma.fulfillmentUser.create({
    data: { name: 'Inactive', email: `inactive-${suffix}@fulfillment.test`, active: false },
  });

  const amazonReader = await createUser('az', { source: 'Amazon', readerType: 'purchased' });
  const bnReader = await createUser('bn', { source: 'Barnes & Noble', readerType: 'purchased' });
  const otherReader = await createUser('ot');
  const giftReader = await createUser('gf', { source: 'Gift', readerType: 'gifted' });
  const websiteReader = await createUser('ws', {
    purchase: { sessionId: `cs_${suffix}_web`, amount: 2499, currency: 'usd', source: 'stripe', saleStatus: 'live' },
  });
  const noEmailReader = await createUser('ne', { email: `anon+${suffix}@reader.crm` });
  const identityReader = await createUser('id');
  const otherPerson = await createUser('op');
  const confirmReader = await createUser('cf');
  const correctReader = await createUser('cr');
  const disputeReader = await createUser('dp');
  const staleReader = await createUser('st');
  const rollbackReader = await createUser('rb');
  const dncReader = await createUser('dn');
  const concurrentReader = await createUser('cc');

  await prisma.user.update({
    where: { id: amazonReader.id },
    data: { phone: '555-010-9999' },
  });
  await prisma.readerProfile.update({
    where: { id: amazonReader.readerProfile.id },
    data: { notes: 'SECRET_CRM_NOTE_DO_NOT_STORE' },
  });
  await prisma.readerCommunication.create({
    data: {
      userId: amazonReader.id,
      category: 'other',
      trigger: 'unknown',
      occurredAt: new Date(),
      outcome: 'unknown',
      source: 'test',
      sourceRef: `${suffix}-comm`,
      caption: 'SECRET_COMMUNICATION_CAPTION',
      recipientEmailSnapshot: amazonReader.email,
    },
  });

  const websiteStripeRow = await prisma.readerEvidence.create({
    data: {
      userId: websiteReader.id,
      kind: 'website_stripe',
      status: 'confirmed',
      sourceLabel: 'website',
      reason: 'synthetic website evidence',
      origin: 'test',
      originRef: `${suffix}-website-stripe`,
      actorType: 'admin',
      actorLabel: 'Test',
    },
  });

  const accountingBefore = await snapshotAccounting();
  let keySeq = 0;
  function nextKey(label) {
    keySeq += 1;
    return `${suffix}-${label}-${keySeq}`;
  }

  await check('source has no email, job, or HTTP router imports', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'readers', 'readerLifecycleWrite.cjs'),
      'utf8',
    );
    for (const banned of [
      'sendEmail',
      'nodemailer',
      'mailchimp',
      'adminReaderLifecycle',
      'runReaderRecommendation',
      'runBackfillReaderProfiles',
      'text-a-friend',
      'createAdminReaderLifecycleRouter',
    ]) {
      assert.ok(!source.includes(banned), `write service mentions ${banned}`);
    }
    assert.ok(source.includes('getReaderLifecycleDetail'));
    assert.ok(ALLOWED_WRITE_DELEGATES.includes('readerMutationIdempotency'));
  });

  await check('guarded prisma refuses Purchase writes', async () => {
    const guarded = asMutationGuardedPrisma(prisma);
    await expectWriteError(
      () =>
        guarded.purchase.create({
          data: {
            userId: amazonReader.id,
            sessionId: `cs_forbidden_${suffix}`,
            amount: 1,
          },
        }),
      'forbidden_write',
      500,
    );
  });

  const amazonKey = nextKey('amazon');
  let amazonAdd;
  await check('add provisional Amazon evidence', async () => {
    amazonAdd = await writes.addEvidence({
      readerProfileId: amazonReader.readerProfile.id,
      kind: 'manual_amazon',
      purchaseDate: '2026-07-01',
      details: 'Kris saw the order email',
      reason: 'Personally known Amazon purchase',
      actorId: helper.id,
      idempotencyKey: amazonKey,
    });
    assert.strictEqual(amazonAdd.ok, true);
    assert.strictEqual(amazonAdd.replay, false);
    assert.strictEqual(amazonAdd.reader.ownership, 'purchaser');
    assert.ok(amazonAdd.reader.sources.includes('amazon'));
    assert.strictEqual(amazonAdd.reader.confidence, 'provisional');
    assert.strictEqual(amazonAdd.reader.review, 'incomplete');
    assert.strictEqual(amazonAdd.reader.nurtureSuppressed, true);
    const current = evidenceByKind(amazonAdd.reader, 'manual_amazon', 'provisional');
    assert.strictEqual(current.length, 1);
    assert.strictEqual(current[0].accountingTruth, false);
  });

  await check('same Amazon key with different body is idempotency conflict', async () => {
    await expectWriteError(
      () =>
        writes.addEvidence({
          readerProfileId: amazonReader.readerProfile.id,
          kind: 'manual_amazon',
          purchaseDate: '2026-08-01',
          details: 'different details',
          reason: 'Personally known Amazon purchase',
          actorId: helper.id,
          idempotencyKey: amazonKey,
        }),
      'idempotency_conflict',
      409,
    );
  });

  await check('same key for a different mutation action is idempotency conflict', async () => {
    await expectWriteError(
      () =>
        writes.addContactDecision({
          readerProfileId: amazonReader.readerProfile.id,
          decision: 'suppress',
          reason: 'Reuse the Amazon add key for DNC',
          actorId: helper.id,
          idempotencyKey: amazonKey,
        }),
      'idempotency_conflict',
      409,
    );
  });

  await check('second current Amazon evidence is allowed with warning', async () => {
    const second = await writes.addEvidence({
      readerProfileId: amazonReader.readerProfile.id,
      kind: 'manual_amazon',
      purchaseDate: '2026-08-02',
      details: 'second known purchase',
      reason: 'Another personally known Amazon order',
      actorId: helper.id,
      idempotencyKey: nextKey('amazon2'),
    });
    assert.ok(second.warnings.includes('multiple_current_same_kind'));
    assert.strictEqual(evidenceByKind(second.reader, 'manual_amazon', 'provisional').length, 2);
  });

  await check('replay after unrelated change returns original receipt and fresh reader', async () => {
    const replay = await writes.addEvidence({
      readerProfileId: amazonReader.readerProfile.id,
      kind: 'manual_amazon',
      purchaseDate: '2026-07-01',
      details: 'Kris saw the order email',
      reason: 'Personally known Amazon purchase',
      actorId: helper.id,
      idempotencyKey: amazonKey,
    });
    assert.strictEqual(replay.replay, true);
    assert.deepStrictEqual(receiptView(replay), receiptView(amazonAdd));
    assert.strictEqual(replay.mutation.entityId, amazonAdd.mutation.entityId);
    assert.strictEqual(evidenceByKind(replay.reader, 'manual_amazon', 'provisional').length, 2);
    assert.notStrictEqual(
      evidenceByKind(replay.reader, 'manual_amazon', 'provisional').length,
      evidenceByKind(amazonAdd.reader, 'manual_amazon', 'provisional').length,
    );
    const stored = await prisma.readerMutationIdempotency.findUnique({
      where: { origin_originRef: { origin: IDEMPOTENCY_ORIGIN, originRef: amazonKey } },
    });
    assert.ok(!stored.resultJson.reader);
    assert.strictEqual(stored.resultJson.mutation.entityId, amazonAdd.mutation.entityId);
    const count = await prisma.readerEvidence.count({
      where: { userId: amazonReader.id, origin: 'admin_manual' },
    });
    assert.strictEqual(count, 2);
  });

  await check('add provisional Barnes & Noble evidence', async () => {
    const result = await writes.addEvidence({
      readerProfileId: bnReader.readerProfile.id,
      kind: 'manual_bn',
      purchaseDate: '2026-06-15',
      details: 'Signing copy',
      reason: 'Personally known B&N purchase',
      actorId: helper.id,
      idempotencyKey: nextKey('bn'),
    });
    assert.ok(result.reader.sources.includes('barnes_noble'));
    assert.strictEqual(result.reader.ownership, 'purchaser');
  });

  await check('add other/manual purchase evidence', async () => {
    const result = await writes.addEvidence({
      readerProfileId: otherReader.readerProfile.id,
      kind: 'manual_other',
      details: 'Independent bookstore',
      reason: 'Known other-retailer purchase',
      actorId: helper.id,
      idempotencyKey: nextKey('other'),
    });
    assert.ok(result.reader.sources.includes('other'));
    assert.ok(result.reader.reasons.includes('missing_purchase_date'));
  });

  await check('add gifted-book ownership evidence', async () => {
    const result = await writes.addEvidence({
      readerProfileId: giftReader.readerProfile.id,
      kind: 'gift_book_owner',
      purchaseDate: '2026-04-01',
      details: 'Gifted at event',
      reason: 'Owns a gifted copy, did not buy',
      actorId: helper.id,
      idempotencyKey: nextKey('gift'),
    });
    assert.strictEqual(result.reader.ownership, 'book_owner_gifted');
    assert.strictEqual(result.reader.nurtureSuppressed, true);
    assert.ok(result.mutation.action === 'evidence.add');
  });

  const confirmKey = nextKey('confirm');
  let confirmAdd;
  let confirmOriginalId;
  let confirmResult;
  await check('confirm through replacement and supersession', async () => {
    confirmAdd = await writes.addEvidence({
      readerProfileId: confirmReader.readerProfile.id,
      kind: 'manual_bn',
      purchaseDate: '2026-05-01',
      details: 'Need to confirm later',
      reason: 'Provisional B&N knowledge',
      actorId: helper.id,
      idempotencyKey: nextKey('confirm-add'),
    });
    const provisional = evidenceByKind(confirmAdd.reader, 'manual_bn', 'provisional')[0];
    confirmOriginalId = provisional.id;
    confirmResult = await writes.confirmEvidence({
      evidenceId: provisional.id,
      expectedStatus: 'provisional',
      reason: 'Reporting later confirmed this purchase',
      actorId: helper.id,
      idempotencyKey: confirmKey,
    });
    const oldRow = await prisma.readerEvidence.findUnique({ where: { id: provisional.id } });
    assert.strictEqual(oldRow.status, 'superseded');
    assert.strictEqual(oldRow.details, 'Need to confirm later');
    assert.ok(oldRow.supersededById);
    const neu = await prisma.readerEvidence.findUnique({ where: { id: oldRow.supersededById } });
    assert.strictEqual(neu.status, 'confirmed');
    assert.strictEqual(neu.kind, 'manual_bn');
    assert.strictEqual(neu.details, 'Need to confirm later');
    assert.notStrictEqual(neu.id, oldRow.id);
    assert.strictEqual(confirmResult.reader.confidence, 'confirmed');
    assert.strictEqual(confirmResult.reader.review, 'clear');
  });

  await check('replay confirm after success does not return stale 409', async () => {
    const replay = await writes.confirmEvidence({
      evidenceId: confirmOriginalId,
      expectedStatus: 'provisional',
      reason: 'Reporting later confirmed this purchase',
      actorId: helper.id,
      idempotencyKey: confirmKey,
    });
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(replay.mutation.entityId, confirmResult.mutation.entityId);
    const supersededCount = await prisma.readerEvidence.count({
      where: { userId: confirmReader.id, status: 'superseded' },
    });
    assert.strictEqual(supersededCount, 1);
  });

  const correctKey = nextKey('correct');
  let correctOriginalId;
  let correctResult;
  await check('correct evidence date and source via supersession', async () => {
    const added = await writes.addEvidence({
      readerProfileId: correctReader.readerProfile.id,
      kind: 'manual_amazon',
      purchaseDate: '2026-01-01',
      details: 'Wrong retailer and date',
      reason: 'First guess at the purchase',
      actorId: helper.id,
      idempotencyKey: nextKey('correct-add'),
    });
    const current = evidenceByKind(added.reader, 'manual_amazon', 'provisional')[0];
    correctOriginalId = current.id;
    correctResult = await writes.correctEvidence({
      evidenceId: current.id,
      expectedStatus: 'provisional',
      kind: 'manual_bn',
      purchaseDate: '2026-03-15',
      details: 'Corrected to Barnes & Noble',
      reason: 'Better evidence arrived later',
      actorId: helper.id,
      idempotencyKey: correctKey,
    });
    const oldRow = await prisma.readerEvidence.findUnique({ where: { id: current.id } });
    assert.strictEqual(oldRow.status, 'superseded');
    assert.strictEqual(oldRow.kind, 'manual_amazon');
    assert.strictEqual(oldRow.supersededById, correctResult.mutation.entityId);
    const neu = await prisma.readerEvidence.findUnique({ where: { id: correctResult.mutation.entityId } });
    assert.strictEqual(neu.kind, 'manual_bn');
    assert.ok(correctResult.reader.sources.includes('barnes_noble'));
    assert.ok(!correctResult.reader.sources.includes('amazon'));
  });

  await check('replay correct after success', async () => {
    const replay = await writes.correctEvidence({
      evidenceId: correctOriginalId,
      expectedStatus: 'provisional',
      kind: 'manual_bn',
      purchaseDate: '2026-03-15',
      details: 'Corrected to Barnes & Noble',
      reason: 'Better evidence arrived later',
      actorId: helper.id,
      idempotencyKey: correctKey,
    });
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(replay.mutation.entityId, correctResult.mutation.entityId);
  });

  const disputeKey = nextKey('dispute');
  const replaceKey = nextKey('replace');
  let disputedId;
  let replaceResult;
  await check('dispute then replace disputed evidence', async () => {
    const added = await writes.addEvidence({
      readerProfileId: disputeReader.readerProfile.id,
      kind: 'manual_amazon',
      purchaseDate: '2026-02-02',
      details: 'May be the wrong person',
      reason: 'Uncertain Amazon association',
      actorId: helper.id,
      idempotencyKey: nextKey('dispute-add'),
    });
    disputedId = evidenceByKind(added.reader, 'manual_amazon', 'provisional')[0].id;
    const disputed = await writes.disputeEvidence({
      evidenceId: disputedId,
      expectedStatus: 'provisional',
      reason: 'This was associated to the wrong reader',
      actorId: helper.id,
      idempotencyKey: disputeKey,
    });
    assert.strictEqual(disputed.reader.review, 'conflicting');
    assert.ok(disputed.reader.reasons.includes('disputed_association'));
    const row = await prisma.readerEvidence.findUnique({ where: { id: disputedId } });
    assert.strictEqual(row.status, 'disputed');
    assert.strictEqual(row.supersededById, null);

    replaceResult = await writes.replaceEvidence({
      evidenceId: disputedId,
      expectedStatus: 'disputed',
      kind: 'gift_book_owner',
      details: 'Owns a gifted copy instead',
      reason: 'Replacement after dispute: gifted owner',
      actorId: helper.id,
      idempotencyKey: replaceKey,
    });
    const oldRow = await prisma.readerEvidence.findUnique({ where: { id: disputedId } });
    assert.strictEqual(oldRow.status, 'superseded');
    assert.strictEqual(oldRow.supersededById, replaceResult.mutation.entityId);
    assert.strictEqual(replaceResult.reader.ownership, 'book_owner_gifted');
    assert.notStrictEqual(replaceResult.reader.review, 'conflicting');
  });

  await check('replay dispute after success', async () => {
    const replay = await writes.disputeEvidence({
      evidenceId: disputedId,
      expectedStatus: 'provisional',
      reason: 'This was associated to the wrong reader',
      actorId: helper.id,
      idempotencyKey: disputeKey,
    });
    assert.strictEqual(replay.replay, true);
  });

  await check('replay replace after success', async () => {
    const replay = await writes.replaceEvidence({
      evidenceId: disputedId,
      expectedStatus: 'disputed',
      kind: 'gift_book_owner',
      details: 'Owns a gifted copy instead',
      reason: 'Replacement after dispute: gifted owner',
      actorId: helper.id,
      idempotencyKey: replaceKey,
    });
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(replay.mutation.entityId, replaceResult.mutation.entityId);
  });

  await check('stale concurrent correction returns 409 for a new key', async () => {
    const added = await writes.addEvidence({
      readerProfileId: staleReader.readerProfile.id,
      kind: 'manual_other',
      details: 'Will be confirmed then stale-corrected',
      reason: 'Setup for stale write conflict',
      actorId: helper.id,
      idempotencyKey: nextKey('stale-add'),
    });
    const current = evidenceByKind(added.reader, 'manual_other', 'provisional')[0];
    await writes.confirmEvidence({
      evidenceId: current.id,
      expectedStatus: 'provisional',
      reason: 'First writer confirmed this row',
      actorId: helper.id,
      idempotencyKey: nextKey('stale-confirm'),
    });
    await expectWriteError(
      () =>
        writes.correctEvidence({
          evidenceId: current.id,
          expectedStatus: 'provisional',
          details: 'Second writer is stale',
          reason: 'This correction should fail as stale',
          actorId: helper.id,
          idempotencyKey: nextKey('stale-correct'),
        }),
      'stale_evidence',
      409,
    );
  });

  const suppressKey = nextKey('suppress');
  const allowKey = nextKey('allow');
  await check('append suppress then allow contact decisions', async () => {
    const suppressed = await writes.addContactDecision({
      readerProfileId: dncReader.readerProfile.id,
      decision: 'suppress',
      reason: 'Reader asked not to be contacted',
      actorId: helper.id,
      idempotencyKey: suppressKey,
    });
    assert.strictEqual(suppressed.reader.contactability, 'suppressed_do_not_contact');
    assert.strictEqual(suppressed.reader.nurtureSuppressed, true);
    const allowed = await writes.addContactDecision({
      readerProfileId: dncReader.readerProfile.id,
      decision: 'allow',
      reason: 'Reader later asked to resume contact',
      actorId: helper.id,
      idempotencyKey: allowKey,
    });
    assert.strictEqual(allowed.reader.contactability, 'contactable');
    assert.strictEqual(allowed.reader.contactDecisions.length, 2);
    assert.strictEqual(allowed.reader.contactDecisions[0].decision, 'suppress');
  });

  await check('replay suppress and allow after success', async () => {
    const suppressReplay = await writes.addContactDecision({
      readerProfileId: dncReader.readerProfile.id,
      decision: 'suppress',
      reason: 'Reader asked not to be contacted',
      actorId: helper.id,
      idempotencyKey: suppressKey,
    });
    const allowReplay = await writes.addContactDecision({
      readerProfileId: dncReader.readerProfile.id,
      decision: 'allow',
      reason: 'Reader later asked to resume contact',
      actorId: helper.id,
      idempotencyKey: allowKey,
    });
    assert.strictEqual(suppressReplay.replay, true);
    assert.strictEqual(allowReplay.replay, true);
    assert.strictEqual(
      await prisma.readerContactDecision.count({ where: { userId: dncReader.id } }),
      2,
    );
  });

  await check('allow does not override missing or synthetic email', async () => {
    const result = await writes.addContactDecision({
      readerProfileId: noEmailReader.readerProfile.id,
      decision: 'allow',
      reason: 'Manual allow despite no mailable email',
      actorId: helper.id,
      idempotencyKey: nextKey('allow-no-email'),
    });
    assert.strictEqual(result.reader.contactability, 'no_mailable_email');
    assert.strictEqual(result.reader.distinctions.safeToSend, false);
  });

  const openKey = nextKey('open-review');
  const resolveKey = nextKey('resolve-review');
  let opened;
  await check('open identity review pauses ownership as unknown', async () => {
    opened = await writes.openIdentityReview({
      readerProfileId: identityReader.readerProfile.id,
      reasonCode: 'duplicate_name',
      details: 'Possible duplicate of another reader',
      otherUserId: otherPerson.id,
      reason: 'Names appear to collide',
      actorId: helper.id,
      idempotencyKey: openKey,
    });
    assert.strictEqual(opened.reader.ownership, 'unknown');
    assert.strictEqual(opened.reader.review, 'identity_review_required');
    assert.strictEqual(opened.reader.nurtureSuppressed, true);
    assert.strictEqual(opened.reader.openReview, true);
    const row = await prisma.readerIdentityReview.findUnique({
      where: { id: opened.mutation.entityId },
    });
    assert.strictEqual(row.actorId, helper.id);
    assert.strictEqual(row.actorLabel, 'Kris');
  });

  await check('reasonCode other requires meaningful details', async () => {
    await expectWriteError(
      () =>
        writes.openIdentityReview({
          readerProfileId: identityReader.readerProfile.id,
          reasonCode: 'other',
          details: 'short',
          reason: 'Need a free-form identity hold',
          actorId: helper.id,
          idempotencyKey: nextKey('other-short'),
        }),
      'invalid_details',
      400,
    );
  });

  await check('resolve identity review preserves opener attribution', async () => {
    const resolved = await writes.resolveIdentityReview({
      reviewId: opened.mutation.entityId,
      expectedStatus: 'open',
      status: 'resolved_keep_separate',
      resolutionReason: 'Confirmed they are different people',
      actorId: resolver.id,
      idempotencyKey: resolveKey,
    });
    const row = await prisma.readerIdentityReview.findUnique({
      where: { id: opened.mutation.entityId },
    });
    assert.strictEqual(row.status, 'resolved_keep_separate');
    assert.strictEqual(row.actorId, helper.id);
    assert.strictEqual(row.actorType, 'admin');
    assert.strictEqual(row.actorLabel, 'Kris');
    assert.ok(row.resolvedAt);
    const audit = await prisma.readerAdminAudit.findFirst({
      where: { action: 'identity_review.resolve', entityId: opened.mutation.entityId },
    });
    assert.strictEqual(audit.actorId, resolver.id);
    assert.strictEqual(audit.actorLabel, 'Denise');
    assert.strictEqual(audit.beforeJson.opener.actorId, helper.id);
    assert.strictEqual(audit.afterJson.resolver.actorId, resolver.id);
    assert.strictEqual(audit.afterJson.opener.actorId, helper.id);
    assert.notStrictEqual(resolved.reader.review, 'identity_review_required');
    assert.strictEqual(resolved.reader.ownership, 'non_purchaser');
  });

  await check('replay open and resolve identity review after success', async () => {
    const openReplay = await writes.openIdentityReview({
      readerProfileId: identityReader.readerProfile.id,
      reasonCode: 'duplicate_name',
      details: 'Possible duplicate of another reader',
      otherUserId: otherPerson.id,
      reason: 'Names appear to collide',
      actorId: helper.id,
      idempotencyKey: openKey,
    });
    const resolveReplay = await writes.resolveIdentityReview({
      reviewId: opened.mutation.entityId,
      expectedStatus: 'open',
      status: 'resolved_keep_separate',
      resolutionReason: 'Confirmed they are different people',
      actorId: resolver.id,
      idempotencyKey: resolveKey,
    });
    assert.strictEqual(openReplay.replay, true);
    assert.strictEqual(resolveReplay.replay, true);
    assert.strictEqual(
      await prisma.readerIdentityReview.count({ where: { primaryUserId: identityReader.id } }),
      1,
    );
  });

  await check('website stripe kind and session id are rejected', async () => {
    await expectWriteError(
      () =>
        writes.addEvidence({
          readerProfileId: websiteReader.readerProfile.id,
          kind: 'website_stripe',
          reason: 'Trying to fake a website purchase',
          actorId: helper.id,
          idempotencyKey: nextKey('fake-web'),
        }),
      'website_purchase_protected',
      409,
    );
    await expectWriteError(
      () =>
        writes.addEvidence({
          readerProfileId: websiteReader.readerProfile.id,
          kind: 'manual_amazon',
          stripeSessionId: 'cs_typed_session',
          reason: 'Typed a Stripe session id by hand',
          actorId: helper.id,
          idempotencyKey: nextKey('typed-session'),
        }),
      'stripe_session_not_allowed',
      400,
    );
    await expectWriteError(
      () =>
        writes.disputeEvidence({
          evidenceId: websiteStripeRow.id,
          expectedStatus: 'confirmed',
          reason: 'Trying to dispute a website purchase',
          actorId: helper.id,
          idempotencyKey: nextKey('dispute-web'),
        }),
      'website_purchase_protected',
      409,
    );
  });

  await check('inactive actor is rejected', async () => {
    await expectWriteError(
      () =>
        writes.addEvidence({
          readerProfileId: amazonReader.readerProfile.id,
          kind: 'manual_amazon',
          reason: 'Inactive helper should not write',
          actorId: inactive.id,
          idempotencyKey: nextKey('inactive'),
        }),
      'actor_inactive',
      400,
    );
  });

  await check('audit rows exist for each successful mutation family', async () => {
    const actions = [
      'evidence.add_provisional',
      'evidence.add_gift',
      'evidence.confirm',
      'evidence.correct',
      'evidence.dispute',
      'evidence.replace_disputed',
      'contact_decision.suppress',
      'contact_decision.allow',
      'identity_review.open',
      'identity_review.resolve',
    ];
    for (const action of actions) {
      const row = await prisma.readerAdminAudit.findFirst({ where: { action } });
      assert.ok(row, `missing audit ${action}`);
      assert.ok(row.actorId);
      assert.ok(row.reason);
    }
  });

  await check('transaction rolls back when audit write fails', async () => {
    const before = await prisma.readerEvidence.count({ where: { userId: rollbackReader.id } });
    const throwing = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === '$transaction') {
          return (fn, options) =>
            target.$transaction(async (tx) => {
              const wrapped = new Proxy(tx, {
                get(inner, name) {
                  if (name === 'readerAdminAudit') {
                    return new Proxy(inner.readerAdminAudit, {
                      get(delegate, method, rec) {
                        if (method === 'create') {
                          return async () => {
                            throw new Error('forced_audit_failure');
                          };
                        }
                        const value = Reflect.get(delegate, method, rec);
                        return typeof value === 'function' ? value.bind(delegate) : value;
                      },
                    });
                  }
                  const value = Reflect.get(inner, name);
                  return typeof value === 'function' ? value.bind(inner) : value;
                },
              });
              return fn(wrapped);
            }, options);
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const failingWrites = createReaderLifecycleWriteService(throwing);
    try {
      await failingWrites.addEvidence({
        readerProfileId: rollbackReader.readerProfile.id,
        kind: 'manual_amazon',
        details: 'Should roll back',
        reason: 'Forced failure after insert',
        actorId: helper.id,
        idempotencyKey: nextKey('rollback'),
      });
      throw new Error('expected rollback failure');
    } catch (err) {
      assert.strictEqual(err.message, 'forced_audit_failure');
    }
    const after = await prisma.readerEvidence.count({ where: { userId: rollbackReader.id } });
    assert.strictEqual(after, before);
    const idem = await prisma.readerMutationIdempotency.count({
      where: { origin: IDEMPOTENCY_ORIGIN, originRef: { contains: 'rollback' } },
    });
    assert.strictEqual(idem, 0);
  });

  await check('concurrent duplicate requests mutate once', async () => {
    const key = nextKey('concurrent');
    const payload = {
      readerProfileId: concurrentReader.readerProfile.id,
      kind: 'manual_amazon',
      purchaseDate: '2026-07-20',
      details: 'Concurrent duplicate submission',
      reason: 'Same intent sent twice at once',
      actorId: helper.id,
      idempotencyKey: key,
    };
    const settled = await Promise.allSettled([writes.addEvidence(payload), writes.addEvidence(payload)]);
    const succeeded = settled.filter((row) => row.status === 'fulfilled').map((row) => row.value);
    const failedBusy = settled.filter((row) => row.status === 'rejected');
    assert.ok(succeeded.length >= 1, 'at least one concurrent request should succeed');
    for (const err of failedBusy) {
      const message = String(err.reason && err.reason.message);
      assert.ok(
        /busy|locked|deadlock|transaction/i.test(message),
        `unexpected concurrent failure: ${message}`,
      );
    }
    const originals = succeeded.filter((row) => row.replay === false);
    const replays = succeeded.filter((row) => row.replay === true);
    if (succeeded.length === 2) {
      assert.strictEqual(originals.length, 1);
      assert.strictEqual(replays.length, 1);
      assert.deepStrictEqual(receiptView(replays[0]), receiptView(originals[0]));
    }
    assert.strictEqual(
      await prisma.readerEvidence.count({ where: { userId: concurrentReader.id } }),
      1,
    );
    assert.strictEqual(
      await prisma.readerAdminAudit.count({
        where: { relatedUserId: concurrentReader.id, action: 'evidence.add_provisional' },
      }),
      1,
    );
    assert.strictEqual(
      await prisma.readerMutationIdempotency.count({
        where: { origin: IDEMPOTENCY_ORIGIN, originRef: key },
      }),
      1,
    );
  });

  await check('idempotency resultJson contains no PII', async () => {
    const snippets = [
      amazonReader.email,
      noEmailReader.email,
      helper.email,
      resolver.email,
      '555-010-9999',
      'SECRET_CRM_NOTE_DO_NOT_STORE',
      'SECRET_COMMUNICATION_CAPTION',
      'Kris saw the order email',
      'Personally known Amazon purchase',
      'Need to confirm later',
      'Wrong retailer and date',
      'May be the wrong person',
      'Possible duplicate of another reader',
      'Reader asked not to be contacted',
      'Checkout email does not match this person',
    ];
    const forbiddenKeys = new Set([
      'reader',
      'email',
      'phone',
      'notes',
      'details',
      'name',
      'communications',
      'contactDecisions',
      'identityReviews',
      'reason',
      'resolutionReason',
      'caption',
      'recipientEmailSnapshot',
    ]);
    const rows = await prisma.readerMutationIdempotency.findMany();
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.strictEqual(row.origin, IDEMPOTENCY_ORIGIN);
      assert.ok(row.resultJson);
      assert.ok(!row.resultJson.pending);
      const keys = collectKeys(row.resultJson);
      for (const key of forbiddenKeys) {
        assert.ok(!keys.has(key), `${row.originRef} stored forbidden key ${key}`);
      }
      assertNoPiiInJson(row.resultJson, snippets, row.originRef);
      assert.ok(row.resultJson.mutation && row.resultJson.mutation.action);
      assert.ok(row.resultJson.readerProfileId);
      assert.ok(row.requestHash);
    }
  });

  await check('accounting tables are unchanged by Reader Manager writes', async () => {
    const after = await snapshotAccounting();
    assert.strictEqual(after.hash, accountingBefore.hash);
    assert.deepStrictEqual(after.counts, accountingBefore.counts);
    const live = await prisma.purchase.findMany({ where: { userId: websiteReader.id } });
    assert.strictEqual(live.length, 1);
    assert.strictEqual(live[0].sessionId, `cs_${suffix}_web`);
    assert.strictEqual(live[0].userId, websiteReader.id);
  });

  await check('website purchaser remains accounting truth and identity hold does not reassign Purchase', async () => {
    const website = await writes.openIdentityReview({
      readerProfileId: websiteReader.readerProfile.id,
      reasonCode: 'possible_wrong_website_owner',
      details: 'Checkout email does not match this person',
      reason: 'Hold outreach until ownership is reviewed',
      actorId: helper.id,
      idempotencyKey: nextKey('web-identity'),
    });
    assert.strictEqual(website.reader.ownership, 'unknown');
    assert.strictEqual(website.reader.purchases[0].accountingTruth, true);
    const purchases = await prisma.purchase.findMany({ where: { userId: websiteReader.id } });
    assert.strictEqual(purchases[0].userId, websiteReader.id);
  });

  const accountingAfter = await snapshotAccounting();
  assert.strictEqual(accountingAfter.hash, accountingBefore.hash);

  await prisma.$disconnect();
  if (failed) {
    console.error(`\nverify-reader-lifecycle-write: ${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nverify-reader-lifecycle-write: ${passed} passed`);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
