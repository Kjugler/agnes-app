#!/usr/bin/env node
/**
 * Disposable-DB checks for guarded Readers Agree ReaderProfile sync.
 * No nurture enrollment. Refuses deepquill/dev.db.
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-ra-profile-'));
  const dbPath = path.join(tmpDir, 'lead-profile.db');
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
const handler = require('../api/readersAgree/lead.cjs');
const { prisma: handlerPrisma } = require('../server/prisma.cjs');
const { READERS_AGREE_V2_SOURCE, PROSPECT_TYPE } = require('../lib/readers/readersAgreeLead.cjs');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

let failed = 0;
let passed = 0;
const suffix = `rap${Date.now()}`;

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function postLead({ email, captureSurface, retailerOrigin, visitorId }) {
  const res = mockRes();
  await handler(
    {
      body: {
        email,
        captureSurface,
        retailerOrigin,
        visitorId: visitorId || 'vid-profile',
        ref: 'TESTREF',
      },
    },
    res,
  );
  return res;
}

async function createExistingUser(email) {
  const token = crypto.randomBytes(5).toString('hex').toUpperCase();
  return prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      code: `C${token}`,
      referralCode: `R${token}`,
      rabbitSeq: 1,
      rabbitTarget: 500,
    },
  });
}

function nurtureUnset(profile) {
  assert.strictEqual(profile.prospectNurtureEnrolledAt, null);
  assert.strictEqual(profile.prospectNurtureStep, null);
  assert.strictEqual(profile.prospectNurtureLastSentAt, null);
  assert.strictEqual(profile.prospectNurtureSuppressedAt, null);
  assert.strictEqual(profile.prospectNurtureSuppressedReason, null);
}

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

(async () => {
  await check('brand-new prospect gets readers-agree-v2 / prospect, no nurture', async () => {
    const email = `new-prospect-${suffix}@example.com`;
    const res = await postLead({
      email,
      captureSurface: 'bridge',
      retailerOrigin: 'amazon',
    });
    assert.strictEqual(res.statusCode, 200);
    const profile = await prisma.readerProfile.findUnique({ where: { userId: res.body.userId } });
    assert.ok(profile);
    assert.strictEqual(profile.source, READERS_AGREE_V2_SOURCE);
    assert.strictEqual(profile.readerType, PROSPECT_TYPE);
    assert.strictEqual(profile.status, 'active');
    assert.strictEqual(profile.emailUpdatesConsent, false);
    assert.strictEqual(profile.notes, null);
    nurtureUnset(profile);
    assert.strictEqual(profile.leadAttribution.captureSurface, 'bridge');
    assert.strictEqual(profile.leadAttribution.retailerOrigin, 'amazon');
    assert.strictEqual(profile.leadAttribution.visitorId, 'vid-profile');
    assert.ok(profile.leadAttribution.capturedAt);
    assert.strictEqual(profile.leadAttribution.enrolledAt, undefined);
    const evidenceCount = await prisma.readerEvidence.count({ where: { userId: res.body.userId } });
    assert.strictEqual(evidenceCount, 0);
    const event = await prisma.event.findFirst({
      where: { userId: res.body.userId, type: 'READERS_AGREE_EMAIL_SUBMITTED' },
    });
    assert.strictEqual(event.meta.retailerOrigin, 'amazon');
    assert.strictEqual(event.meta.captureSurface, 'bridge');
    assert.strictEqual(event.meta.visitorId, 'vid-profile');
  });

  await check('existing prospect updates attribution without relabel or nurture', async () => {
    const email = `existing-prospect-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.readerProfile.create({
      data: {
        userId: user.id,
        source: READERS_AGREE_V2_SOURCE,
        readerType: PROSPECT_TYPE,
        status: 'active',
        notes: 'keep me',
        leadAttribution: { visitorId: 'old', captureSurface: 'landing' },
      },
    });
    const res = await postLead({ email, captureSurface: 'bridge', retailerOrigin: 'bn' });
    assert.strictEqual(res.body.userId, user.id);
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.strictEqual(profile.source, READERS_AGREE_V2_SOURCE);
    assert.strictEqual(profile.readerType, PROSPECT_TYPE);
    assert.strictEqual(profile.status, 'active');
    assert.strictEqual(profile.notes, 'keep me');
    assert.strictEqual(profile.leadAttribution.retailerOrigin, 'bn');
    assert.strictEqual(profile.leadAttribution.captureSurface, 'bridge');
    nurtureUnset(profile);
  });

  await check('existing purchaser is not relabeled prospect', async () => {
    const email = `purchaser-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.readerProfile.create({
      data: {
        userId: user.id,
        source: 'Website',
        readerType: 'purchased',
        status: 'active',
        notes: 'stripe owner',
      },
    });
    await prisma.purchase.create({
      data: {
        userId: user.id,
        sessionId: `cs_live_${suffix}`,
        amount: 1999,
        currency: 'usd',
        source: 'stripe',
        saleStatus: 'live',
      },
    });
    const res = await postLead({ email, captureSurface: 'bridge', retailerOrigin: 'amazon' });
    assert.strictEqual(res.statusCode, 200);
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.strictEqual(profile.source, 'Website');
    assert.strictEqual(profile.readerType, 'purchased');
    assert.strictEqual(profile.status, 'active');
    assert.strictEqual(profile.notes, 'stripe owner');
    assert.strictEqual(profile.leadAttribution.captureSurface, 'bridge');
    nurtureUnset(profile);
  });

  await check('existing gifted owner is not relabeled prospect', async () => {
    const email = `gifted-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.readerProfile.create({
      data: {
        userId: user.id,
        source: 'Gift',
        readerType: 'gifted',
        status: 'active',
      },
    });
    await prisma.readerEvidence.create({
      data: {
        userId: user.id,
        kind: 'gift_book_owner',
        status: 'confirmed',
        reason: 'test gift',
        origin: 'test',
        originRef: `${suffix}-gift`,
        actorType: 'admin',
        actorLabel: 'Test',
      },
    });
    await postLead({ email, captureSurface: 'landing' });
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.strictEqual(profile.source, 'Gift');
    assert.strictEqual(profile.readerType, 'gifted');
    assert.strictEqual(await prisma.readerEvidence.count({ where: { userId: user.id } }), 1);
  });

  await check('archived profile keeps archived status and type', async () => {
    const email = `archived-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.readerProfile.create({
      data: {
        userId: user.id,
        source: 'Website',
        readerType: 'interested',
        status: 'archived',
        archiveReasonCode: 'test_archive',
      },
    });
    await postLead({ email, captureSurface: 'bridge', retailerOrigin: 'amazon' });
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.strictEqual(profile.status, 'archived');
    assert.strictEqual(profile.source, 'Website');
    assert.strictEqual(profile.readerType, 'interested');
    assert.strictEqual(profile.archiveReasonCode, 'test_archive');
    assert.strictEqual(profile.leadAttribution.captureSurface, 'bridge');
  });

  await check('existing interested is not relabeled prospect', async () => {
    const email = `interested-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.readerProfile.create({
      data: {
        userId: user.id,
        source: 'Jody Concierge',
        readerType: 'interested',
        status: 'active',
      },
    });
    await postLead({ email, captureSurface: 'landing' });
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.strictEqual(profile.source, 'Jody Concierge');
    assert.strictEqual(profile.readerType, 'interested');
  });

  await check('purchaser without profile is created as purchased, not prospect', async () => {
    const email = `purchase-noprof-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.purchase.create({
      data: {
        userId: user.id,
        sessionId: `cs_noprof_${suffix}`,
        amount: 1999,
        currency: 'usd',
        source: 'stripe',
        saleStatus: 'live',
      },
    });
    const res = await postLead({ email, captureSurface: 'bridge', retailerOrigin: 'bn' });
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.ok(profile);
    assert.strictEqual(profile.readerType, 'purchased');
    assert.notStrictEqual(profile.readerType, PROSPECT_TYPE);
    assert.strictEqual(profile.source, 'Website');
    assert.strictEqual(profile.leadAttribution.retailerOrigin, 'bn');
    nurtureUnset(profile);
    assert.strictEqual(res.body.redirectPath.startsWith('/sample-chapters'), true);
  });

  await check('gifted owner without profile is created as gifted, not prospect', async () => {
    const email = `gift-noprof-${suffix}@example.com`;
    const user = await createExistingUser(email);
    await prisma.readerEvidence.create({
      data: {
        userId: user.id,
        kind: 'gift_book_owner',
        status: 'confirmed',
        reason: 'test gift noprofile',
        origin: 'test',
        originRef: `${suffix}-gift-noprof`,
        actorType: 'admin',
        actorLabel: 'Test',
      },
    });
    await postLead({ email, captureSurface: 'landing' });
    const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    assert.strictEqual(profile.source, 'Gift');
    assert.strictEqual(profile.readerType, 'gifted');
    nurtureUnset(profile);
  });

  await check('profile write failure does not block sample-chapter access', async () => {
    const email = `profile-fail-${suffix}@example.com`;
    const orig = handlerPrisma.readerProfile.findUnique.bind(handlerPrisma.readerProfile);
    handlerPrisma.readerProfile.findUnique = async () => {
      throw new Error('simulated profile lookup failure');
    };
    try {
      const res = await postLead({ email, captureSurface: 'landing' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.ok, true);
      assert.ok(String(res.body.redirectPath).startsWith('/sample-chapters'));
    } finally {
      handlerPrisma.readerProfile.findUnique = orig;
    }
  });

  await check('later BN submit does not erase earlier Amazon email Event', async () => {
    const email = `amazon-then-bn-${suffix}@example.com`;
    const amazon = await postLead({
      email,
      captureSurface: 'bridge',
      retailerOrigin: 'amazon',
      visitorId: 'vid-amazon',
    });
    const bn = await postLead({
      email,
      captureSurface: 'bridge',
      retailerOrigin: 'bn',
      visitorId: 'vid-bn',
    });
    assert.strictEqual(amazon.body.userId, bn.body.userId);
    const events = await prisma.event.findMany({
      where: { userId: amazon.body.userId, type: 'READERS_AGREE_EMAIL_SUBMITTED' },
      orderBy: { createdAt: 'asc' },
    });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].meta.retailerOrigin, 'amazon');
    assert.strictEqual(events[0].meta.visitorId, 'vid-amazon');
    assert.strictEqual(events[0].meta.captureSurface, 'bridge');
    assert.strictEqual(events[1].meta.retailerOrigin, 'bn');
    assert.strictEqual(events[1].meta.visitorId, 'vid-bn');
    const profile = await prisma.readerProfile.findUnique({ where: { userId: amazon.body.userId } });
    assert.strictEqual(profile.leadAttribution.retailerOrigin, 'bn');
    nurtureUnset(profile);
  });

  console.log(`${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  try {
    await handlerPrisma.$disconnect();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore on Windows file locks */
  }
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error('verify-readers-agree-lead-profile: FAIL', err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  try {
    await handlerPrisma.$disconnect();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
