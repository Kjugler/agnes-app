#!/usr/bin/env node
/**
 * Disposable-DB checks: valid emails must grant /sample-chapters access every time.
 * Landing and bridge share this handler. Refuses deepquill/dev.db.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const FUNNEL_EVENT = 'READERS_AGREE_EMAIL_SUBMITTED';

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-ra-lead-'));
  const dbPath = path.join(tmpDir, 'lead-repeat.db');
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
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');

assert.strictEqual(FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED, FUNNEL_EVENT);

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

let failed = 0;
let passed = 0;
const suffix = `ra${Date.now()}`;

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

async function postLead({ email, captureSurface, visitorId }) {
  const res = mockRes();
  await handler(
    {
      body: {
        email,
        captureSurface,
        visitorId: visitorId || null,
      },
    },
    res,
  );
  return res;
}

function assertAccessGranted(res, email, label) {
  assert.strictEqual(res.statusCode, 200, `${label} http ${res.statusCode} ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.ok, true, `${label} ok`);
  assert.strictEqual(res.body.email, email.trim().toLowerCase(), `${label} email`);
  assert.ok(res.body.userId, `${label} userId`);
  assert.ok(
    String(res.body.redirectPath).startsWith('/sample-chapters'),
    `${label} redirectPath ${res.body.redirectPath}`,
  );
}

async function countUsers(email) {
  return prisma.user.count({ where: { email: email.trim().toLowerCase() } });
}

async function countLeadEvents(userId) {
  return prisma.event.count({
    where: { userId, type: FUNNEL_EVENT },
  });
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
  const landingNew = `landing-new-${suffix}@example.com`;
  const bridgeNew = `bridge-new-${suffix}@example.com`;
  const landingThenBridge = `land-then-bridge-${suffix}@example.com`;
  const bridgeThenLanding = `bridge-then-land-${suffix}@example.com`;
  const existingNoEvent = `existing-none-${suffix}@example.com`;
  const existingWithEvent = `existing-prior-${suffix}@example.com`;

  await check('brand-new email on landing grants access', async () => {
    const res = await postLead({ email: landingNew, captureSurface: 'landing', visitorId: 'v-land-1' });
    assertAccessGranted(res, landingNew, 'landing-new');
    assert.strictEqual(await countUsers(landingNew), 1);
    assert.strictEqual(await countLeadEvents(res.body.userId), 1);
  });

  await check('same email again on landing still grants access', async () => {
    const first = await prisma.user.findUnique({ where: { email: landingNew } });
    const res = await postLead({ email: landingNew, captureSurface: 'landing', visitorId: 'v-land-1' });
    assertAccessGranted(res, landingNew, 'landing-repeat');
    assert.strictEqual(res.body.userId, first.id);
    assert.strictEqual(await countUsers(landingNew), 1);
    assert.strictEqual(await countLeadEvents(first.id), 2);
    const events = await prisma.event.findMany({
      where: { userId: first.id, type: FUNNEL_EVENT },
      orderBy: { createdAt: 'asc' },
    });
    assert.strictEqual(events[0].meta.priorEmailSubmitCount, 0);
    assert.strictEqual(events[1].meta.priorEmailSubmitCount, 1);
    assert.strictEqual(events[1].meta.captureSurface, 'landing');
  });

  await check('brand-new email on bridge grants access', async () => {
    const res = await postLead({ email: bridgeNew, captureSurface: 'bridge', visitorId: 'v-bridge-1' });
    assertAccessGranted(res, bridgeNew, 'bridge-new');
    assert.strictEqual(await countUsers(bridgeNew), 1);
    const events = await prisma.event.findMany({
      where: { userId: res.body.userId, type: FUNNEL_EVENT },
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].meta.captureSurface, 'bridge');
    const profile = await prisma.readerProfile.findUnique({ where: { userId: res.body.userId } });
    assert.ok(profile);
    assert.strictEqual(profile.source, 'readers-agree-v2');
    assert.strictEqual(profile.readerType, 'prospect');
    assert.strictEqual(profile.prospectNurtureEnrolledAt, null);
  });

  await check('same email again on bridge still grants access', async () => {
    const first = await prisma.user.findUnique({ where: { email: bridgeNew } });
    const res = await postLead({ email: bridgeNew, captureSurface: 'bridge', visitorId: 'v-bridge-1' });
    assertAccessGranted(res, bridgeNew, 'bridge-repeat');
    assert.strictEqual(res.body.userId, first.id);
    assert.strictEqual(await countUsers(bridgeNew), 1);
    assert.strictEqual(await countLeadEvents(first.id), 2);
  });

  await check('email first used on landing, then later on bridge', async () => {
    const first = await postLead({
      email: landingThenBridge,
      captureSurface: 'landing',
      visitorId: 'v-cross-1',
    });
    assertAccessGranted(first, landingThenBridge, 'cross-landing');
    const second = await postLead({
      email: landingThenBridge,
      captureSurface: 'bridge',
      visitorId: 'v-cross-1',
    });
    assertAccessGranted(second, landingThenBridge, 'cross-bridge');
    assert.strictEqual(first.body.userId, second.body.userId);
    assert.strictEqual(await countUsers(landingThenBridge), 1);
    const events = await prisma.event.findMany({
      where: { userId: first.body.userId, type: FUNNEL_EVENT },
      orderBy: { createdAt: 'asc' },
    });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].meta.captureSurface, 'landing');
    assert.strictEqual(events[1].meta.captureSurface, 'bridge');
  });

  await check('email first used on bridge, then later on landing', async () => {
    const first = await postLead({
      email: bridgeThenLanding,
      captureSurface: 'bridge',
      visitorId: 'v-cross-2',
    });
    assertAccessGranted(first, bridgeThenLanding, 'cross-bridge-first');
    const second = await postLead({
      email: bridgeThenLanding,
      captureSurface: 'landing',
      visitorId: 'v-cross-2',
    });
    assertAccessGranted(second, bridgeThenLanding, 'cross-landing-later');
    assert.strictEqual(first.body.userId, second.body.userId);
    assert.strictEqual(await countUsers(bridgeThenLanding), 1);
  });

  await check('existing User with no previous readers-agree event', async () => {
    const user = await createExistingUser(existingNoEvent);
    const res = await postLead({
      email: existingNoEvent,
      captureSurface: 'landing',
      visitorId: 'v-existing-1',
    });
    assertAccessGranted(res, existingNoEvent, 'existing-none');
    assert.strictEqual(res.body.userId, user.id);
    assert.strictEqual(await countUsers(existingNoEvent), 1);
    assert.strictEqual(await countLeadEvents(user.id), 1);
  });

  await check('existing User with previous readers-agree events', async () => {
    const user = await createExistingUser(existingWithEvent);
    await prisma.event.create({
      data: {
        userId: user.id,
        type: FUNNEL_EVENT,
        meta: { captureSurface: 'landing', source: 'fixture' },
      },
    });
    const res = await postLead({
      email: existingWithEvent,
      captureSurface: 'bridge',
      visitorId: 'v-existing-2',
    });
    assertAccessGranted(res, existingWithEvent, 'existing-prior');
    assert.strictEqual(res.body.userId, user.id);
    assert.strictEqual(await countUsers(existingWithEvent), 1);
    assert.strictEqual(await countLeadEvents(user.id), 2);
  });

  await check('invalid email remains rejected', async () => {
    const res = await postLead({ email: 'not-an-email', captureSurface: 'landing' });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.error, 'invalid_email');
    assert.ok(!res.body.redirectPath);
  });

  await check('repeated valid submissions do not create duplicate User records', async () => {
    const email = `repeat-three-${suffix}@example.com`;
    const a = await postLead({ email, captureSurface: 'landing' });
    const b = await postLead({ email, captureSurface: 'bridge' });
    const c = await postLead({ email, captureSurface: 'landing' });
    assertAccessGranted(a, email, 'dup-1');
    assertAccessGranted(b, email, 'dup-2');
    assertAccessGranted(c, email, 'dup-3');
    assert.strictEqual(a.body.userId, b.body.userId);
    assert.strictEqual(b.body.userId, c.body.userId);
    assert.strictEqual(await countUsers(email), 1);
    assert.strictEqual(await countLeadEvents(a.body.userId), 3);
  });

  await check('event recording failure does not block access', async () => {
    const email = `event-fail-${suffix}@example.com`;
    const first = await postLead({ email, captureSurface: 'landing' });
    assertAccessGranted(first, email, 'event-fail-create');
    const orig = handlerPrisma.event.create.bind(handlerPrisma.event);
    handlerPrisma.event.create = async () => {
      throw new Error('simulated event write failure');
    };
    try {
      const second = await postLead({ email, captureSurface: 'landing' });
      assertAccessGranted(second, email, 'event-fail-repeat');
      assert.strictEqual(second.body.userId, first.body.userId);
      assert.strictEqual(await countUsers(email), 1);
    } finally {
      handlerPrisma.event.create = orig;
    }
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
  console.error('verify-readers-agree-lead-repeat: FAIL', err);
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
