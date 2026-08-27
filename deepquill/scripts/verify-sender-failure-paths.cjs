#!/usr/bin/env node
/**
 * Checkpoint 5J-C3: caller no-send behavior when promotional eligibility
 * cannot be established. Synthetic fixtures only. Refuses deepquill/dev.db.
 * Does not call Mailchimp or send email.
 */
const assert = require('assert');
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-5jc3-send-'));
  const dbPath = path.join(tmpDir, 'sender.db');
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

const { PrismaClient } = require('@prisma/client');
const { runAdminEmailSend } = require('../lib/email/adminEmailSend.cjs');
const { runReaderRecommendationOutreach } = require('../lib/email/runReaderRecommendationOutreach.cjs');
const {
  createReaderLifecycleWriteService,
} = require('../lib/readers/readerLifecycleWrite.cjs');
const {
  loadPromotionalIneligibleEmailSet,
  promotionalOutreachEligibility,
} = require('../lib/readers/readerOutreachEligibility.cjs');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const writes = createReaderLifecycleWriteService(prisma);

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

function scan(rel) {
  return fs.readFileSync(path.join(DEEPQUILL_ROOT, rel), 'utf8');
}

function assertSkipBeforeSend(src, label) {
  const skipAt = src.indexOf(`skipDiscretionaryOutreach(user, '${label}')`);
  const sendAt = src.indexOf('client.messages.send', skipAt);
  assert.ok(skipAt > 0, `${label}: skip helper missing`);
  assert.ok(sendAt > skipAt, `${label}: messages.send must follow skip`);
  const between = src.slice(skipAt, sendAt);
  assert.match(between, /continue/);
  assert.doesNotMatch(between, /messages\.send/);
}

async function main() {
  await check('source: callers skip or abort before send and do not leak lookup errors', () => {
    const jobs = scan('server/routes/adminJobs.cjs');
    assert.match(jobs, /skipDiscretionaryOutreach/);
    assert.match(jobs, /result\.eligible !== true \|\| result\.lookup !== 'ok'/);
    assert.match(jobs, /Skipping ineligible reader: \$\{result\.reason/);
    assert.doesNotMatch(jobs, /Skipping ineligible reader: \$\{user\.email/);
    for (const label of [
      'engaged-reminder',
      'non-participant-reminder',
      'no-purchase-reminder',
      'missionary-email',
    ]) {
      assertSkipBeforeSend(jobs, label);
    }

    const outreach = scan('lib/email/runReaderRecommendationOutreach.cjs');
    const eligAt = outreach.indexOf('promotionalOutreachEligibility(prisma');
    const sendAt = outreach.indexOf('client.messages.send');
    assert.ok(eligAt > 0 && sendAt > eligAt);
    assert.match(outreach, /!eligibility\.eligible \|\| eligibility\.lookup !== 'ok'/);

    const admin = scan('lib/email/adminEmailSend.cjs');
    assert.match(admin, /loadPromotionalIneligibleEmailSet/);
    assert.match(admin, /Could not establish promotional exclusion set/);
    const loadAt = admin.indexOf('loadPromotionalIneligibleEmailSet');
    assert.ok(admin.indexOf('client.messages.send') > loadAt);
    assert.doesNotMatch(admin.slice(loadAt, admin.indexOf('client.messages.send')), /archivedSet = new Set\(\)/);

    const quiet = scan('scripts/send-quiet-reveal-email.cjs');
    assert.match(quiet, /loadPromotionalIneligibleEmailSet/);
    assert.match(quiet, /Could not establish promotional exclusion set; aborting before send/);
    assert.match(quiet, /archivedSet\.has\(TEST_EMAIL\)/);
    assert.match(quiet, /TEST_EMAIL is operationally ineligible/);

    const subscribe = scan('api/subscribe.cjs');
    assert.match(subscribe, /if \(!gate\.mailchimpAllowed\)/);
    const catchBlock = subscribe.slice(subscribe.indexOf('catch (eligibilityErr)'));
    assert.doesNotMatch(catchBlock.slice(0, 500), /eligibilityErr\.message/);
    assert.doesNotMatch(catchBlock.slice(0, 500), /lists\.setListMember/);

    assert.doesNotMatch(scan('api/stripe-webhook.cjs'), /promotionalOutreachEligibility|loadPromotionalIneligibleEmailSet/);
    assert.doesNotMatch(scan('lib/email/resendPurchaseEmails.cjs'), /promotionalOutreachEligibility|loadPromotionalIneligibleEmailSet/);
  });

  await check('batch helper throws when prisma is missing', async () => {
    await assert.rejects(() => loadPromotionalIneligibleEmailSet(null), /prisma_required/);
  });

  await check('admin promotional tool aborts before send when exclusion lookup throws', async () => {
    const exploding = {
      user: { findMany: async () => [] },
      customer: { findMany: async () => [] },
      referralConversion: { findMany: async () => [] },
      purchase: { findMany: async () => [] },
      order: { findMany: async () => [] },
      readerProfile: {
        findMany: async () => {
          throw new Error('synthetic exclusion lookup failure for secret@example.test');
        },
      },
      readerContactDecision: { findMany: async () => [] },
      readerIdentityReview: { findMany: async () => [] },
    };
    const out = await runAdminEmailSend(exploding, {
      mode: 'dry-run',
      template: 'quiet-reveal',
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.sent, 0);
    assert.strictEqual(out.error, 'Could not establish promotional exclusion set');
    assert.doesNotMatch(JSON.stringify(out), /secret@example\.test|synthetic exclusion lookup failure/i);
  });

  await check('recommendation outreach skips a reader when eligibility lookup throws', async () => {
    const token = `sfp${Date.now()}`.slice(0, 22);
    const user = await prisma.user.create({
      data: {
        email: `${token}@sender.test`,
        code: token,
        referralCode: token.toUpperCase(),
        fname: 'Sender',
        lname: 'Path',
        readerProfile: {
          create: { source: 'Website', readerType: 'purchased', status: 'active' },
        },
      },
    });
    const original = prisma.readerContactDecision.findMany.bind(prisma.readerContactDecision);
    prisma.readerContactDecision.findMany = async () => {
      throw new Error('synthetic eligibility lookup failure');
    };
    try {
      const eligibility = await promotionalOutreachEligibility(prisma, { userId: user.id, email: user.email });
      assert.strictEqual(eligibility.lookup, 'failed');
      assert.strictEqual(eligibility.eligible, false);
      const outreach = await runReaderRecommendationOutreach(prisma, { dryRun: true, limit: 20 });
      assert.strictEqual(outreach.sent, 0);
      assert.ok(outreach.skipped.suppressed >= 1);
      const sample = JSON.stringify(outreach.recipientSample || []);
      assert.ok(!sample.includes(user.email));
      assert.doesNotMatch(JSON.stringify(outreach), /synthetic eligibility lookup failure/i);
    } finally {
      prisma.readerContactDecision.findMany = original;
    }
  });

  await check('archived User linked only through Order/customer excludes conversion email from batch send', async () => {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    const token = `ord${Date.now()}`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const helper = await prisma.fulfillmentUser.create({
      data: { name: 'Kris', email: `kris-${token}@fulfillment.test`, active: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `user-${token}@sender.test`,
        code: `${token}u`,
        referralCode: `${token}U`,
        fname: 'OrderLinked',
        lname: 'Archived',
        readerProfile: {
          create: { source: 'Website', readerType: 'interested', status: 'active' },
        },
      },
      include: { readerProfile: true },
    });
    const referrer = await prisma.user.create({
      data: {
        email: `ref-${token}@sender.test`,
        code: `${token}r`,
        referralCode: `${token}R`,
        fname: 'Referrer',
        lname: 'User',
      },
    });
    const customerEmail = `cust-${token}@sender.test`;
    const buyerEmail = `buyer-${token}@sender.test`;
    const sessionId = `cs_${token}_order_only`;
    const customer = await prisma.customer.create({
      data: {
        email: customerEmail,
        userId: user.id,
        name: 'Order Customer',
      },
    });
    await prisma.order.create({
      data: {
        customerId: customer.id,
        stripeSessionId: sessionId,
      },
    });
    await prisma.referralConversion.create({
      data: {
        referrerUserId: referrer.id,
        referralCode: referrer.referralCode,
        buyerEmail,
        stripeSessionId: sessionId,
        product: 'book',
      },
    });
    await writes.archiveReader({
      readerProfileId: user.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before Order-only conversion batch exclusion',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: `${token}-arch-order`,
    });

    const set = await loadPromotionalIneligibleEmailSet(prisma);
    assert.ok(set.has(buyerEmail.toLowerCase()), 'Order-linked conversion email must be excluded');
    assert.ok(set.has(user.email.toLowerCase()));
    assert.ok(set.has(customerEmail.toLowerCase()));

    const out = await runAdminEmailSend(prisma, {
      mode: 'dry-run',
      template: 'quiet-reveal',
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.sent, 0);
    assert.ok(out.skipped.archived >= 3, 'User, Customer, and Order-linked conversion emails must skip');
  });

  const exitCode = failed ? 1 : 0;
  if (failed) console.error(`\nverify-sender-failure-paths: ${failed} failed, ${passed} passed`);
  else console.log(`\nverify-sender-failure-paths: ${passed} passed`);
  await prisma.$disconnect();
  try {
    fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows can keep a brief lock on the disposable sqlite file. */
  }
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
