#!/usr/bin/env node
/**
 * Disposable-DB checks for Checkpoint 5J-C1 archive/restore and outreach suppression.
 * Refuses deepquill/dev.db. Synthetic fixtures only.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-5jc1-'));
  const dbPath = path.join(tmpDir, 'archive.db');
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
  return { tmpDir, dbPath, fileUrl };
}

let disposable = null;
if (!process.env.DATABASE_URL || isCanonicalDevDb(process.env.DATABASE_URL)) {
  disposable = migrateDisposable();
  process.env.DATABASE_URL = disposable.fileUrl;
} else {
  refuseDevDb(process.env.DATABASE_URL);
}

process.env.NODE_ENV = 'test';
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'checkpoint5jc1-synthetic-admin-key';

const { PrismaClient } = require('@prisma/client');
const {
  createReaderLifecycleWriteService,
  LifecycleWriteError,
  ARCHIVE_CONTACT_ORIGIN,
  RESTORE_CONTACT_ORIGIN,
  RESTORE_PRIOR_STATUS_REASON,
  DUPLICATE_ARCHIVE_WARNING,
} = require('../lib/readers/readerLifecycleWrite.cjs');
const { listReaderLifecycle, getReaderLifecycleDetail } = require('../lib/readers/readerLifecycleRead.cjs');
const { ensureReaderProfileFromPurchase } = require('../lib/readers/ensureReaderProfileFromPurchase.cjs');
const { promotionalOutreachEligibility } = require('../lib/readers/readerOutreachEligibility.cjs');
const { LATER_PURCHASE_REASON } = require('../lib/readers/surfaceArchivedLaterPurchase.cjs');
const { resolveContactSuppression } = require('../lib/readers/readerContactSuppression.cjs');
const { runReaderRecommendationOutreach } = require('../lib/email/runReaderRecommendationOutreach.cjs');
const createAdminReaderLifecycleWriteRouter = require('../server/routes/adminReaderLifecycleWrite.cjs');
const adminReadersRouter = require('../server/routes/adminReaders.cjs');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const writes = createReaderLifecycleWriteService(prisma);
const suffix = `cp5jc1${Date.now()}`;
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
      console.error(`FAIL ${name}: ${err && err.message}`);
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

function nextKey(label) {
  return `${suffix}-${label}-${crypto.randomBytes(4).toString('hex')}`;
}

async function createUser(label, extra = {}) {
  const token = `${suffix}${label}`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
  return prisma.user.create({
    data: {
      email: extra.email || `${token}@archive.test`,
      code: token,
      referralCode: token.toUpperCase(),
      fname: extra.fname || label,
      lname: extra.lname || 'Reader',
      readerProfile: {
        create: {
          source: extra.source || 'Website',
          readerType: extra.readerType || 'interested',
          status: extra.status || 'active',
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

function scan(rel) {
  return fs.readFileSync(path.join(DEEPQUILL_ROOT, rel), 'utf8');
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  const helper = await prisma.fulfillmentUser.create({
    data: { name: 'Kris', email: `kris-${suffix}@fulfillment.test`, active: true },
  });
  const inactive = await prisma.fulfillmentUser.create({
    data: { name: 'Inactive', email: `inactive-${suffix}@fulfillment.test`, active: false },
  });

  await check('source: promotional senders use shared eligibility; transactional paths do not', () => {
    assert.match(scan('lib/email/runReaderRecommendationOutreach.cjs'), /promotionalOutreachEligibility/);
    assert.match(scan('server/routes/adminJobs.cjs'), /skipDiscretionaryOutreach/);
    assert.match(scan('lib/email/adminEmailSend.cjs'), /loadPromotionalIneligibleEmailSet/);
    assert.match(scan('scripts/send-quiet-reveal-email.cjs'), /loadPromotionalIneligibleEmailSet/);
    assert.match(scan('api/subscribe.cjs'), /resolveSubscribePromotionalGate/);
    assert.match(scan('api/subscribe.cjs'), /mailchimpAllowed/);
    assert.match(scan('lib/readers/readerContactSuppression.cjs'), /resolveContactSuppression/);
    assert.match(scan('server/routes/adminReaders.cjs'), /restore_before_contact_edit/);
    assert.doesNotMatch(scan('api/stripe-webhook.cjs'), /promotionalOutreachEligibility|loadPromotionalIneligibleEmailSet/);
    assert.doesNotMatch(scan('lib/readers/jodyReaderState.cjs'), /promotionalOutreachEligibility/);
    assert.match(scan('server/routes/adminReaders.cjs'), /use_lifecycle_archive/);
    assert.match(scan('server/routes/adminReaders.cjs'), /use_lifecycle_restore/);
    const ensureSrc = scan('lib/readers/ensureReaderProfileFromPurchase.cjs');
    const alreadyLoggedAt = ensureSrc.indexOf("reason: 'already_logged'");
    const surfaceCallAt = ensureSrc.lastIndexOf('surfaceArchivedLaterPurchase(prisma, profile)');
    assert.ok(alreadyLoggedAt > 0 && alreadyLoggedAt < surfaceCallAt);
  });

  await check('equal-timestamp contact decisions use stable id ordering', () => {
    const at = '2026-08-01T00:00:00.000Z';
    const independent = resolveContactSuppression({
      profileStatus: 'active',
      decisions: [
        { id: 'i1_allow', createdAt: at, decision: 'allow', origin: 'admin_decision' },
        { id: 'i2_suppress', createdAt: at, decision: 'suppress', origin: 'admin_decision' },
      ],
    });
    assert.strictEqual(independent.reason, 'manual_dnc');
    const archiveLane = resolveContactSuppression({
      profileStatus: 'active',
      decisions: [
        { id: 'a1_suppress', createdAt: at, decision: 'suppress', origin: 'admin_lifecycle_archive' },
        { id: 'a2_allow', createdAt: at, decision: 'allow', origin: 'admin_lifecycle_restore' },
      ],
    });
    assert.strictEqual(archiveLane.suppressed, false);
    const restoreDoesNotOverrideIndependent = resolveContactSuppression({
      profileStatus: 'active',
      decisions: [
        { id: 'i2_suppress', createdAt: at, decision: 'suppress', origin: 'admin_decision' },
        { id: 'a2_allow', createdAt: at, decision: 'allow', origin: 'admin_lifecycle_restore' },
      ],
    });
    assert.strictEqual(restoreDoesNotOverrideIndependent.reason, 'manual_dnc');
  });

  await check('archive is unavailable when mutations are disabled', async () => {
    const previous = process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;
    delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;
    const app = express();
    app.use(express.json());
    app.use('/api/admin/reader-lifecycle', createAdminReaderLifecycleWriteRouter(prisma));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const user = await createUser('flag');
    const body = JSON.stringify({
      reasonCode: 'test_record',
      reason: 'Should not archive while flag is off',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
    });
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/admin/reader-lifecycle/readers/${user.readerProfile.id}/archive`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Idempotency-Key': nextKey('flag'),
            'x-admin-key': process.env.ADMIN_KEY,
          },
        },
        (response) => {
          const chunks = [];
          response.on('data', (c) => chunks.push(c));
          response.on('end', () => {
            resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') });
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;
    else process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = previous;
    assert.strictEqual(res.status, 503, res.text);
    assert.match(res.text, /lifecycle_mutations_disabled/);
    const profile = await prisma.readerProfile.findUnique({ where: { id: user.readerProfile.id } });
    assert.strictEqual(profile.status, 'active');
  });

  const purchased = await createUser('buy', {
    readerType: 'purchased',
    purchase: {
      sessionId: `cs_${suffix}_buy`,
      amount: 2499,
      currency: 'usd',
      source: 'stripe',
      saleStatus: 'live',
    },
  });
  const purchasesBefore = JSON.stringify(await prisma.purchase.findMany({ where: { userId: purchased.id } }));

  await check('valid archive records status, reason, contact exclusion, and audit atomically', async () => {
    const result = await writes.archiveReader({
      readerProfileId: purchased.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Synthetic test operational archive',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('arch-ok'),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reader.legacy.status, 'archived');
    assert.strictEqual(result.reader.legacy.archiveReasonCode, 'test_record');
    assert.strictEqual(result.reader.nurtureSuppressed, true);
    assert.notStrictEqual(result.reader.contactability, 'suppressed_do_not_contact');
    const profile = await prisma.readerProfile.findUnique({ where: { id: purchased.readerProfile.id } });
    assert.strictEqual(profile.status, 'archived');
    assert.strictEqual(profile.archivePriorStatus, 'active');
    const decisions = await prisma.readerContactDecision.findMany({ where: { userId: purchased.id } });
    assert.strictEqual(decisions.length, 1);
    assert.strictEqual(decisions[0].origin, ARCHIVE_CONTACT_ORIGIN);
    assert.strictEqual(decisions[0].decision, 'suppress');
    const audits = await prisma.readerAdminAudit.findMany({
      where: { relatedUserId: purchased.id, action: 'profile.archive' },
    });
    assert.strictEqual(audits.length, 1);
    assert.strictEqual(audits[0].actorId, helper.id);
  });

  await check('Purchase and accounting history remain unchanged after archive', async () => {
    assert.strictEqual(JSON.stringify(await prisma.purchase.findMany({ where: { userId: purchased.id } })), purchasesBefore);
    assert.strictEqual(await prisma.order.count(), 0);
    assert.strictEqual(await prisma.referralConversion.count(), 0);
  });

  await check('archived readers disappear from default lists but appear with Include archived', async () => {
    const hidden = await listReaderLifecycle(prisma, { pageSize: 50 });
    assert.equal(
      hidden.items.some((row) => row.readerProfileId === purchased.readerProfile.id),
      false,
    );
    const shown = await listReaderLifecycle(prisma, { pageSize: 50, includeArchived: true });
    assert.ok(shown.items.some((row) => row.readerProfileId === purchased.readerProfile.id));
    const detail = await getReaderLifecycleDetail(prisma, { readerProfileId: purchased.readerProfile.id });
    assert.ok(detail);
    assert.strictEqual(detail.legacy.status, 'archived');
  });

  await check('archived readers are excluded from discretionary eligibility and recommendation outreach', async () => {
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: purchased.id });
    assert.strictEqual(eligibility.eligible, false);
    assert.strictEqual(eligibility.reason, 'archived');
    const outreach = await runReaderRecommendationOutreach(prisma, { dryRun: true, limit: 20 });
    assert.ok(outreach.skipped.archived >= 1);
    const sample = JSON.stringify(outreach.recipientSample || []);
    assert.ok(!sample.includes(purchased.email));
  });

  await check('duplicate archive warns and does not write archive DNC', async () => {
    const dup = await createUser('dup');
    const result = await writes.archiveReader({
      readerProfileId: dup.readerProfile.id,
      reasonCode: 'duplicate_or_identity_issue',
      reason: 'Possible duplicate operational record only',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('dup'),
    });
    assert.ok(result.warnings.includes(DUPLICATE_ARCHIVE_WARNING));
    const decisions = await prisma.readerContactDecision.findMany({ where: { userId: dup.id } });
    assert.strictEqual(decisions.length, 0);
  });

  await check('other requires details; inactive actor and missing confirmation fail', async () => {
    const other = await createUser('oth');
    await expectWriteError(
      () =>
        writes.archiveReader({
          readerProfileId: other.readerProfile.id,
          reasonCode: 'other',
          reason: 'Needs more specific details here',
          expectedStatus: 'active',
          confirmed: true,
          actorId: helper.id,
          idempotencyKey: nextKey('oth-miss'),
        }),
      'invalid_details',
      400,
    );
    await expectWriteError(
      () =>
        writes.archiveReader({
          readerProfileId: other.readerProfile.id,
          reasonCode: 'test_record',
          reason: 'Confirmed must be true for archive',
          expectedStatus: 'active',
          actorId: helper.id,
          idempotencyKey: nextKey('oth-conf'),
        }),
      'confirmation_required',
      400,
    );
    await expectWriteError(
      () =>
        writes.archiveReader({
          readerProfileId: other.readerProfile.id,
          reasonCode: 'test_record',
          reason: 'Inactive helpers cannot archive',
          expectedStatus: 'active',
          confirmed: true,
          actorId: inactive.id,
          idempotencyKey: nextKey('oth-act'),
        }),
      'actor_inactive',
      400,
    );
  });

  await check('stale expected status and payload mismatch fail safely', async () => {
    const stale = await createUser('stale');
    const key = nextKey('stale-key');
    const body = {
      readerProfileId: stale.readerProfile.id,
      reasonCode: 'invalid_contact',
      reason: 'Invalid contact used for archive',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: key,
    };
    await writes.archiveReader(body);
    await expectWriteError(
      () => writes.archiveReader({ ...body, expectedStatus: 'inactive', idempotencyKey: nextKey('stale-2') }),
      'lifecycle_profile_archived',
      409,
    );
    await expectWriteError(
      () => writes.archiveReader({ ...body, reason: 'A different administrative explanation' }),
      'idempotency_conflict',
      409,
    );
    const profile = await prisma.readerProfile.findUnique({ where: { id: stale.readerProfile.id } });
    assert.strictEqual(profile.status, 'archived');
    assert.strictEqual(profile.archiveReasonCode, 'invalid_contact');
  });

  await check('idempotent replay does not create duplicate audit or contact records', async () => {
    const replayUser = await createUser('rep');
    const key = nextKey('replay');
    const input = {
      readerProfileId: replayUser.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Replay should not duplicate rows',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: key,
    };
    const first = await writes.archiveReader(input);
    const second = await writes.archiveReader(input);
    assert.strictEqual(second.replay, true);
    assert.strictEqual(second.mutation.auditId, first.mutation.auditId);
    assert.strictEqual(await prisma.readerAdminAudit.count({ where: { relatedUserId: replayUser.id } }), 1);
    assert.strictEqual(await prisma.readerContactDecision.count({ where: { userId: replayUser.id } }), 1);
  });

  await check('independent Do Not Contact survives restore; archive-created suppression is removed', async () => {
    const independent = await createUser('ind');
    await writes.addContactDecision({
      readerProfileId: independent.readerProfile.id,
      decision: 'suppress',
      reason: 'Independent do not contact decision',
      actorId: helper.id,
      idempotencyKey: nextKey('ind-dnc'),
    });
    await writes.archiveReader({
      readerProfileId: independent.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive after independent DNC',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('ind-arch'),
    });
    const restored = await writes.restoreReader({
      readerProfileId: independent.readerProfile.id,
      reason: 'Restore must keep independent DNC',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('ind-res'),
    });
    assert.strictEqual(restored.reader.legacy.status, 'active');
    assert.ok(restored.mutation.contactDecisionId);
    const latest = await prisma.readerContactDecision.findMany({
      where: { userId: independent.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(latest.some((row) => row.origin === RESTORE_CONTACT_ORIGIN && row.decision === 'allow'));
    assert.ok(latest.some((row) => row.origin !== RESTORE_CONTACT_ORIGIN && row.origin !== ARCHIVE_CONTACT_ORIGIN && row.decision === 'suppress'));
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: independent.id });
    assert.strictEqual(eligibility.eligible, false);
    assert.strictEqual(eligibility.reason, 'manual_dnc');
    assert.strictEqual(restored.reader.contactability, 'suppressed_do_not_contact');
  });

  await check('restore preserves history and removes only archive-created suppression', async () => {
    const onlyArchive = await createUser('clr');
    await writes.archiveReader({
      readerProfileId: onlyArchive.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive created the only suppression',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('clr-arch'),
    });
    const restored = await writes.restoreReader({
      readerProfileId: onlyArchive.readerProfile.id,
      reason: 'Restore after archive-only suppression',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('clr-res'),
    });
    assert.strictEqual(restored.reader.legacy.status, 'active');
    assert.strictEqual(restored.reader.legacy.archiveReasonCode, null);
    const restoreAllow = await prisma.readerContactDecision.findFirst({
      where: { userId: onlyArchive.id, origin: RESTORE_CONTACT_ORIGIN },
    });
    assert.ok(restoreAllow);
    assert.strictEqual(restoreAllow.decision, 'allow');
    assert.ok((await prisma.readerAdminAudit.count({ where: { relatedUserId: onlyArchive.id } })) >= 2);
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: onlyArchive.id });
    assert.strictEqual(eligibility.eligible, true);
  });

  await check('concurrent archive/restore cannot corrupt state', async () => {
    const raced = await createUser('race');
    const results = await Promise.allSettled([
      writes.archiveReader({
        readerProfileId: raced.readerProfile.id,
        reasonCode: 'test_record',
        reason: 'First concurrent archive attempt',
        expectedStatus: 'active',
        confirmed: true,
        actorId: helper.id,
        idempotencyKey: nextKey('race-a'),
      }),
      writes.archiveReader({
        readerProfileId: raced.readerProfile.id,
        reasonCode: 'invalid_contact',
        reason: 'Second concurrent archive attempt',
        expectedStatus: 'active',
        confirmed: true,
        actorId: helper.id,
        idempotencyKey: nextKey('race-b'),
      }),
    ]);
    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);
    assert.ok(
      ['stale_status', 'lifecycle_profile_archived'].includes(rejected[0].reason.code),
      rejected[0].reason && rejected[0].reason.code,
    );
    const profile = await prisma.readerProfile.findUnique({ where: { id: raced.readerProfile.id } });
    assert.strictEqual(profile.status, 'archived');
    assert.ok(['test_record', 'invalid_contact'].includes(profile.archiveReasonCode));
    assert.strictEqual(await prisma.readerAdminAudit.count({ where: { relatedUserId: raced.id, action: 'profile.archive' } }), 1);
  });

  await check('later purchases do not unarchive and surface review without outreach', async () => {
    const later = await createUser('lat', { readerType: 'purchased' });
    await writes.archiveReader({
      readerProfileId: later.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before a later purchase',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('lat-arch'),
    });
    await prisma.purchase.create({
      data: {
        userId: later.id,
        sessionId: `cs_${suffix}_later`,
        amount: 1999,
        currency: 'usd',
        source: 'stripe',
        saleStatus: 'live',
      },
    });
    const sync = await ensureReaderProfileFromPurchase(prisma, {
      userId: later.id,
      sessionId: `cs_${suffix}_later`,
      product: 'book',
      purchasedAt: new Date(),
    });
    assert.strictEqual(sync.action, 'updated');
    const profile = await prisma.readerProfile.findUnique({ where: { id: later.readerProfile.id } });
    assert.strictEqual(profile.status, 'archived');
    const review = await prisma.readerIdentityReview.findFirst({
      where: { primaryUserId: later.id, reasonCode: LATER_PURCHASE_REASON, status: 'open' },
    });
    assert.ok(review);
    const detail = await getReaderLifecycleDetail(prisma, { readerProfileId: later.readerProfile.id });
    assert.strictEqual(detail.review, 'identity_review_required');
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: later.id });
    assert.strictEqual(eligibility.eligible, false);
    const again = await ensureReaderProfileFromPurchase(prisma, {
      userId: later.id,
      sessionId: `cs_${suffix}_later`,
      product: 'book',
    });
    assert.strictEqual(again.action, 'skipped');
    assert.strictEqual(await prisma.readerIdentityReview.count({ where: { primaryUserId: later.id } }), 1);
    await expectWriteError(
      () =>
        writes.resolveIdentityReview({
          reviewId: review.id,
          status: 'dismissed',
          resolutionReason: 'Recorded the later purchase without unarchiving',
          expectedStatus: 'open',
          actorId: helper.id,
          idempotencyKey: nextKey('lat-resolve'),
        }),
      'lifecycle_profile_archived',
      409,
    );
    const stillOpen = await prisma.readerIdentityReview.findUnique({ where: { id: review.id } });
    assert.strictEqual(stillOpen.status, 'open');
    const replay = await ensureReaderProfileFromPurchase(prisma, {
      userId: later.id,
      sessionId: `cs_${suffix}_later`,
      product: 'book',
    });
    assert.strictEqual(replay.action, 'skipped');
    assert.strictEqual(await prisma.readerIdentityReview.count({ where: { primaryUserId: later.id } }), 1);
    const stillArchived = await prisma.readerProfile.findUnique({ where: { id: later.readerProfile.id } });
    assert.strictEqual(stillArchived.status, 'archived');
  });

  await check('automated upsert does not silently reactivate an archive', async () => {
    const pinned = await createUser('pin');
    await writes.archiveReader({
      readerProfileId: pinned.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Pin against unaudited status writes',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('pin-arch'),
    });
    await prisma.readerProfile.update({
      where: { id: pinned.readerProfile.id },
      data: {
        notes: 'contact edit only',
        status: 'archived',
      },
    });
    const profile = await prisma.readerProfile.findUnique({ where: { id: pinned.readerProfile.id } });
    assert.strictEqual(profile.status, 'archived');
  });

  await check('archived profile rejects contact-decision mutations; restore remains allowed', async () => {
    const during = await createUser('dur');
    await writes.archiveReader({
      readerProfileId: during.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before independent DNC during hold',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('dur-arch'),
    });
    await expectWriteError(
      () =>
        writes.addContactDecision({
          readerProfileId: during.readerProfile.id,
          decision: 'suppress',
          reason: 'Independent DNC recorded while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('dur-dnc'),
        }),
      'lifecycle_profile_archived',
      409,
    );
    await expectWriteError(
      () =>
        writes.addContactDecision({
          readerProfileId: during.readerProfile.id,
          decision: 'allow',
          reason: 'Allow contact recorded while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('dur-allow'),
        }),
      'lifecycle_profile_archived',
      409,
    );
    assert.strictEqual(
      await prisma.readerContactDecision.count({
        where: { userId: during.id, origin: { not: ARCHIVE_CONTACT_ORIGIN } },
      }),
      0,
    );
    const restored = await writes.restoreReader({
      readerProfileId: during.readerProfile.id,
      reason: 'Restore after blocked DNC during archive',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('dur-res'),
    });
    assert.strictEqual(restored.reader.legacy.status, 'active');
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: during.id });
    assert.strictEqual(eligibility.eligible, true);
  });

  await check('independent DNC after restore suppresses; removing it does not revive archive suppression', async () => {
    const after = await createUser('aft');
    await writes.archiveReader({
      readerProfileId: after.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before post-restore DNC cycle',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('aft-arch'),
    });
    await writes.restoreReader({
      readerProfileId: after.readerProfile.id,
      reason: 'Restore before later independent DNC',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('aft-res'),
    });
    await writes.addContactDecision({
      readerProfileId: after.readerProfile.id,
      decision: 'suppress',
      reason: 'Independent DNC after restore',
      actorId: helper.id,
      idempotencyKey: nextKey('aft-dnc'),
    });
    const suppressed = await promotionalOutreachEligibility(prisma, { userId: after.id });
    assert.strictEqual(suppressed.eligible, false);
    assert.strictEqual(suppressed.reason, 'manual_dnc');
    await writes.addContactDecision({
      readerProfileId: after.readerProfile.id,
      decision: 'allow',
      reason: 'Independent DNC removed after restore',
      actorId: helper.id,
      idempotencyKey: nextKey('aft-allow'),
    });
    const cleared = await promotionalOutreachEligibility(prisma, { userId: after.id });
    assert.strictEqual(cleared.eligible, true);
    assert.strictEqual(cleared.reason, 'eligible');
    const archiveSuppress = await prisma.readerContactDecision.findMany({
      where: { userId: after.id, origin: ARCHIVE_CONTACT_ORIGIN, decision: 'suppress' },
    });
    assert.ok(archiveSuppress.length >= 1);
  });

  await check('two complete Archive/Restore cycles stay deterministic and fully audited', async () => {
    const cyc = await createUser('cyc');
    for (const n of [1, 2]) {
      await writes.archiveReader({
        readerProfileId: cyc.readerProfile.id,
        reasonCode: 'test_record',
        reason: `Archive cycle ${n} operational record`,
        expectedStatus: 'active',
        confirmed: true,
        actorId: helper.id,
        idempotencyKey: nextKey(`cyc-a${n}`),
      });
      const restored = await writes.restoreReader({
        readerProfileId: cyc.readerProfile.id,
        reason: `Restore cycle ${n} operational record`,
        expectedStatus: 'archived',
        confirmed: true,
        actorId: helper.id,
        idempotencyKey: nextKey(`cyc-r${n}`),
      });
      assert.strictEqual(restored.reader.legacy.status, 'active');
    }
    const replayKey = nextKey('cyc-replay');
    const first = await writes.restoreReader({
      readerProfileId: cyc.readerProfile.id,
      reason: 'Should fail because not archived',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: replayKey,
    }).catch((err) => err);
    assert.strictEqual(first.code, 'stale_status');
    await writes.archiveReader({
      readerProfileId: cyc.readerProfile.id,
      reasonCode: 'invalid_contact',
      reason: 'Archive for restore replay check',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('cyc-arch3'),
    });
    const restoreInput = {
      readerProfileId: cyc.readerProfile.id,
      reason: 'Idempotent restore replay after cycles',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('cyc-idemp'),
    };
    const one = await writes.restoreReader(restoreInput);
    const two = await writes.restoreReader(restoreInput);
    assert.strictEqual(two.replay, true);
    assert.strictEqual(two.mutation.auditId, one.mutation.auditId);
    const decisions = await prisma.readerContactDecision.findMany({ where: { userId: cyc.id } });
    const restoreAllows = decisions.filter((row) => row.origin === RESTORE_CONTACT_ORIGIN);
    assert.strictEqual(restoreAllows.length, 3);
    assert.strictEqual(await prisma.readerAdminAudit.count({ where: { relatedUserId: cyc.id, action: 'profile.restore' } }), 3);
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: cyc.id });
    assert.strictEqual(eligibility.eligible, true);
  });

  await check('corrupt prior status restores to inactive and opens review', async () => {
    const bad = await createUser('bad');
    await writes.archiveReader({
      readerProfileId: bad.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before corrupting prior status',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('bad-arch'),
    });
    await prisma.readerProfile.update({
      where: { id: bad.readerProfile.id },
      data: { archivePriorStatus: 'not-a-real-status' },
    });
    const restored = await writes.restoreReader({
      readerProfileId: bad.readerProfile.id,
      reason: 'Restore with corrupt prior status',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('bad-res'),
    });
    assert.strictEqual(restored.reader.legacy.status, 'inactive');
    assert.ok(restored.warnings.includes('prior_status_unavailable'));
    assert.strictEqual(restored.mutation.restoreFallback, true);
    const review = await prisma.readerIdentityReview.findFirst({
      where: { primaryUserId: bad.id, reasonCode: RESTORE_PRIOR_STATUS_REASON, status: 'open' },
    });
    assert.ok(review);
    const eligibility = await promotionalOutreachEligibility(prisma, { userId: bad.id });
    assert.strictEqual(eligibility.eligible, false);
    assert.strictEqual(eligibility.reason, 'restore_review');
  });

  await check('Reader Manager contact edits on archived readers are rejected', async () => {
    const rm = await createUser('rmc');
    await writes.archiveReader({
      readerProfileId: rm.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before Reader Manager contact edit',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('rmc-arch'),
    });
    const app = express();
    app.use(express.json());
    app.use('/api/admin/readers', adminReadersRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    function readersReq(method, urlPath, body) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'x-admin-key': process.env.ADMIN_KEY,
            },
          },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve({ status: res.statusCode, json: JSON.parse(text) });
            });
          },
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    }
    try {
      const patchEmail = await readersReq('PATCH', `/api/admin/readers/${rm.readerProfile.id}`, {
        email: `changed-${suffix}@archive.test`,
      });
      assert.strictEqual(patchEmail.status, 409);
      assert.strictEqual(patchEmail.json.error, 'restore_before_contact_edit');
      const patchSms = await readersReq('PATCH', `/api/admin/readers/${rm.readerProfile.id}`, {
        phone: '5551234567',
        smsConsentGranted: true,
        smsConsentSource: 'verbal',
      });
      assert.strictEqual(patchSms.status, 409);
      const patchNotes = await readersReq('PATCH', `/api/admin/readers/${rm.readerProfile.id}`, {
        notes: 'Administrative note on archived reader',
      });
      assert.strictEqual(patchNotes.status, 200, JSON.stringify(patchNotes.json));
      const after = await prisma.user.findUnique({ where: { id: rm.id } });
      assert.strictEqual(after.email, rm.email);
      const profile = await prisma.readerProfile.findUnique({ where: { id: rm.readerProfile.id } });
      assert.strictEqual(profile.status, 'archived');
      const post = await readersReq('POST', '/api/admin/readers', {
        email: rm.email,
        firstName: 'Changed',
        notes: 'try to upsert archived contact',
      });
      assert.strictEqual(post.status, 409);
      assert.strictEqual(post.json.error, 'restore_before_contact_edit');
    } finally {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  await check('archived profile blocks every mutation family except restore', async () => {
    const target = await createUser('ab');
    const added = await writes.addEvidence({
      readerProfileId: target.readerProfile.id,
      kind: 'manual_amazon',
      reason: 'Setup evidence before archive',
      actorId: helper.id,
      idempotencyKey: nextKey('ab-add'),
    });
    const provisional = added.reader.evidenceHistory.find((row) => row.kind === 'manual_amazon' && row.status === 'provisional');
    const toDispute = await writes.addEvidence({
      readerProfileId: target.readerProfile.id,
      kind: 'manual_bn',
      reason: 'Second evidence to dispute before archive',
      actorId: helper.id,
      idempotencyKey: nextKey('ab-bn'),
    });
    const disputedRow = toDispute.reader.evidenceHistory.find((row) => row.kind === 'manual_bn' && row.status === 'provisional');
    await writes.disputeEvidence({
      evidenceId: disputedRow.id,
      expectedStatus: 'provisional',
      reason: 'Dispute before archive to test replace block',
      actorId: helper.id,
      idempotencyKey: nextKey('ab-disp'),
    });
    const opened = await writes.openIdentityReview({
      readerProfileId: target.readerProfile.id,
      reasonCode: 'duplicate_name',
      reason: 'Identity review opened before archive',
      actorId: helper.id,
      idempotencyKey: nextKey('ab-id'),
    });
    await writes.archiveReader({
      readerProfileId: target.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive synthetic profile to test mutation block',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('ab-arch'),
    });
    const blocked = [
      () =>
        writes.addEvidence({
          readerProfileId: target.readerProfile.id,
          kind: 'manual_other',
          reason: 'Should not add evidence while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-add2'),
        }),
      () =>
        writes.confirmEvidence({
          evidenceId: provisional.id,
          expectedStatus: 'provisional',
          reason: 'Should not confirm while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-conf'),
        }),
      () =>
        writes.correctEvidence({
          evidenceId: provisional.id,
          expectedStatus: 'provisional',
          reason: 'Should not correct while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-corr'),
        }),
      () =>
        writes.disputeEvidence({
          evidenceId: provisional.id,
          expectedStatus: 'provisional',
          reason: 'Should not dispute while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-disp2'),
        }),
      () =>
        writes.replaceEvidence({
          evidenceId: disputedRow.id,
          expectedStatus: 'disputed',
          reason: 'Should not replace while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-repl'),
        }),
      () =>
        writes.addContactDecision({
          readerProfileId: target.readerProfile.id,
          decision: 'suppress',
          reason: 'Should not add DNC while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-dnc'),
        }),
      () =>
        writes.addContactDecision({
          readerProfileId: target.readerProfile.id,
          decision: 'allow',
          reason: 'Should not allow contact while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-allow'),
        }),
      () =>
        writes.openIdentityReview({
          readerProfileId: target.readerProfile.id,
          reasonCode: 'possible_wrong_website_owner',
          details: 'Should not open while archived',
          reason: 'Should not open identity while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-open'),
        }),
      () =>
        writes.resolveIdentityReview({
          reviewId: opened.mutation.reviewId,
          expectedStatus: 'open',
          status: 'dismissed',
          resolutionReason: 'Should not resolve while archived',
          actorId: helper.id,
          idempotencyKey: nextKey('ab-resv'),
        }),
      () =>
        writes.archiveReader({
          readerProfileId: target.readerProfile.id,
          reasonCode: 'test_record',
          reason: 'Should not archive an archived profile',
          expectedStatus: 'active',
          confirmed: true,
          actorId: helper.id,
          idempotencyKey: nextKey('ab-arch2'),
        }),
    ];
    for (const fn of blocked) {
      await expectWriteError(fn, 'lifecycle_profile_archived', 409);
    }
    const restored = await writes.restoreReader({
      readerProfileId: target.readerProfile.id,
      reason: 'Restore is the only allowed archived-profile mutation',
      expectedStatus: 'archived',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: nextKey('ab-rest'),
    });
    assert.strictEqual(restored.reader.legacy.status, 'active');
  });

  await check('restore requires archived expected status', async () => {
    const live = await createUser('live');
    await expectWriteError(
      () =>
        writes.restoreReader({
          readerProfileId: live.readerProfile.id,
          reason: 'Cannot restore an active reader',
          expectedStatus: 'archived',
          confirmed: true,
          actorId: helper.id,
          idempotencyKey: nextKey('live-res'),
        }),
      'stale_status',
      409,
    );
  });

  const exitCode = failed ? 1 : 0;
  if (failed) console.error(`\nverify-reader-lifecycle-archive: ${failed} failed, ${passed} passed`);
  else console.log(`\nverify-reader-lifecycle-archive: ${passed} passed`);
  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
