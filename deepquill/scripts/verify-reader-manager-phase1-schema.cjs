#!/usr/bin/env node
/**
 * Disposable-DB checks for Reader Manager Phase 1 foundation tables.
 * Requires DATABASE_URL pointing at a temp SQLite file — never deepquill/dev.db.
 * Usage (from deepquill): node scripts/verify-reader-manager-phase1-schema.cjs
 */
const assert = require('assert');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL || '';
const normalized = url.replace(/\\/g, '/').toLowerCase();
if (!url.startsWith('file:')) {
  throw new Error('DATABASE_URL must be a sqlite file: URL');
}
if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
  throw new Error('Refusing to run against the normal local deepquill/dev.db');
}

const prisma = new PrismaClient();
const fromUrl = process.env.CHECKPOINT2_FROM_URL || '';
const fromPrisma = fromUrl ? new PrismaClient({ datasourceUrl: fromUrl }) : null;

function actor() {
  return { actorType: 'admin', actorLabel: 'Kris' };
}

function jsonStable(value) {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
}

async function tableInfo(client, table) {
  return client.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
}

async function indexList(client, table) {
  return client.$queryRawUnsafe(`PRAGMA index_list("${table}")`);
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

  const tables = (await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  )).map((r) => r.name);
  for (const name of [
    'ReaderEvidence',
    'ReaderCommunication',
    'ReaderIdentityReview',
    'ReaderAdminAudit',
    'ReaderContactDecision',
  ]) {
    assert.ok(tables.includes(name), `missing table ${name}`);
  }

  const isUnique = (row) => Number(row.unique) === 1;
  const evidenceIndexes = await indexList(prisma, 'ReaderEvidence');
  assert.ok(evidenceIndexes.some((i) => i.name === 'ReaderEvidence_origin_originRef_key' && isUnique(i)));
  const commIndexes = await indexList(prisma, 'ReaderCommunication');
  assert.ok(commIndexes.some((i) => i.name === 'ReaderCommunication_source_sourceRef_key' && isUnique(i)));

  if (fromPrisma) {
    for (const table of ['Purchase', 'Order', 'User', 'ReaderProfile', 'ReferralConversion', 'Ledger']) {
      const before = jsonStable(await tableInfo(fromPrisma, table));
      const after = jsonStable(await tableInfo(prisma, table));
      assert.strictEqual(after, before, `${table} structure changed`);
    }
    const rp = await tableInfo(prisma, 'ReaderProfile');
    const names = rp.map((c) => c.name);
    for (const col of [
      'emailMarketingConsentAt',
      'leadAttribution',
      'prospectNurtureEnrolledAt',
      'prospectNurtureStep',
      'prospectNurtureLastSentAt',
      'prospectNurtureSuppressedAt',
      'prospectNurtureSuppressedReason',
    ]) {
      assert.ok(names.includes(col), `missing reconciled column ${col}`);
    }
    console.log('ok  existing tables unchanged vs 46-migration baseline');
  }

  const suffix = `cp2${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${suffix}@example.net`,
      code: suffix,
      referralCode: suffix.toUpperCase(),
    },
  });

  const evidence = await prisma.readerEvidence.create({
    data: {
      userId: user.id,
      kind: 'manual_amazon',
      status: 'provisional',
      sourceLabel: 'Amazon',
      reason: 'crm_backfill',
      origin: 'crm_backfill',
      originRef: `${user.id}:amazon`,
      ...actor(),
    },
  });

  try {
    await prisma.readerEvidence.create({
      data: {
        userId: user.id,
        kind: 'manual_amazon',
        status: 'provisional',
        reason: 'crm_backfill',
        origin: 'crm_backfill',
        originRef: `${user.id}:amazon`,
        ...actor(),
      },
    });
    throw new Error('expected evidence unique violation');
  } catch (err) {
    if (String(err.message).includes('expected evidence unique')) throw err;
    console.log('ok  evidence origin/originRef idempotency');
  }

  await prisma.readerCommunication.create({
    data: {
      userId: user.id,
      recipientEmailSnapshot: user.email,
      category: 'reader_recommendation_taf',
      templateOrAskId: 'taf_ask_1',
      trigger: 'unknown',
      occurredAt: new Date('2026-06-01T00:00:00Z'),
      outcome: 'recorded_sent_delivery_unknown',
      source: 'user_stamp',
      sourceRef: `${user.id}:readerRecommendationOutreachSentAt`,
      caption: 'Inferred historical TAF ask #1',
    },
  });
  try {
    await prisma.readerCommunication.create({
      data: {
        userId: user.id,
        category: 'reader_recommendation_taf',
        trigger: 'unknown',
        occurredAt: new Date(),
        outcome: 'unknown',
        source: 'user_stamp',
        sourceRef: `${user.id}:readerRecommendationOutreachSentAt`,
      },
    });
    throw new Error('expected communication unique violation');
  } catch (err) {
    if (String(err.message).includes('expected communication unique')) throw err;
    console.log('ok  communication source/sourceRef idempotency');
  }

  await prisma.readerContactDecision.create({
    data: {
      userId: user.id,
      decision: 'suppress',
      reason: 'reader asked not to be contacted',
      origin: 'admin_decision',
      originRef: `${suffix}-dnc-1`,
      ...actor(),
    },
  });
  await prisma.readerContactDecision.create({
    data: {
      userId: user.id,
      decision: 'allow',
      reason: 'reader asked to resume contact',
      origin: 'admin_decision',
      originRef: `${suffix}-dnc-2`,
      ...actor(),
    },
  });
  const decisions = await prisma.readerContactDecision.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  });
  assert.strictEqual(decisions.length, 2);
  assert.strictEqual(decisions[0].decision, 'suppress');
  assert.strictEqual(decisions[1].decision, 'allow');
  console.log('ok  contact-decision suppress then allow is two history rows');

  await prisma.readerIdentityReview.create({
    data: {
      primaryUserId: user.id,
      reasonCode: 'duplicate_name',
      status: 'open',
      ...actor(),
    },
  });
  await prisma.readerIdentityReview.create({
    data: {
      primaryUserId: user.id,
      reasonCode: 'similar_email',
      status: 'open',
      ...actor(),
    },
  });
  const openReviews = await prisma.readerIdentityReview.count({
    where: { primaryUserId: user.id, otherUserId: null, status: 'open' },
  });
  assert.strictEqual(openReviews, 2);
  console.log('ok  multiple NULL otherUserId identity reviews are allowed');
  await prisma.readerAdminAudit.create({
    data: {
      relatedUserId: user.id,
      action: 'evidence.create',
      entityType: 'ReaderEvidence',
      entityId: evidence.id,
      afterJson: { id: evidence.id },
      reason: 'schema verification',
      ...actor(),
    },
  });

  let deleteBlocked = false;
  try {
    await prisma.user.delete({ where: { id: user.id } });
  } catch (err) {
    deleteBlocked = /Foreign key|FOREIGN KEY|constraint/i.test(String(err.message) + String(err.code || ''));
  }
  assert.ok(deleteBlocked, 'User delete should be restricted while history exists');
  assert.ok(await prisma.user.findUnique({ where: { id: user.id } }));
  assert.ok(await prisma.readerEvidence.findUnique({ where: { id: evidence.id } }));
  console.log('ok  User delete restricted while lifecycle history exists');

  const purchaseCount = await prisma.purchase.count();
  assert.strictEqual(purchaseCount, 0);
  console.log('ok  no Purchase rows required or created');

  console.log('verify-reader-manager-phase1-schema: passed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (fromPrisma) await fromPrisma.$disconnect();
  });
