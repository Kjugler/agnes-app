#!/usr/bin/env node
/**
 * Disposable-DB checks for Checkpoint 5J-C2 subscribe fail-closed gate.
 * Synthetic fixtures only. Refuses deepquill/dev.db. Does not call Mailchimp.
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-5jc2-sub-'));
  const dbPath = path.join(tmpDir, 'subscribe.db');
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
const {
  createReaderLifecycleWriteService,
} = require('../lib/readers/readerLifecycleWrite.cjs');
const {
  resolveSubscribePromotionalGate,
  subscribeLocalAccessResponse,
} = require('../lib/readers/readerOutreachEligibility.cjs');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const writes = createReaderLifecycleWriteService(prisma);
const suffix = `sub${Date.now()}`;
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

async function createUser(label, extra = {}) {
  const token = `${suffix}${label}`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
  return prisma.user.create({
    data: {
      email: extra.email || `${token}@subscribe.test`,
      code: token,
      referralCode: token.toUpperCase(),
      fname: extra.fname || label,
      lname: 'Reader',
      readerProfile: {
        create: {
          source: 'Website',
          readerType: 'interested',
          status: extra.status || 'active',
        },
      },
    },
    include: { readerProfile: true },
  });
}

function mixedCaseEmails(localPart, domain) {
  const local = String(localPart).toLowerCase();
  const host = String(domain).toLowerCase();
  const variants = [
    `${local}@${host}`,
    `${local[0].toUpperCase()}${local.slice(1)}@${host}`,
    `${local.toUpperCase()}@${host}`,
    `${local}@${host[0].toUpperCase()}${host.slice(1)}`,
    `${local[0].toUpperCase()}${local.slice(1)}@${host.toUpperCase()}`,
    `${local.toUpperCase()}@${host.toUpperCase()}`,
  ];
  const lowered = `${local}@${host}`;
  const unique = [...new Set(variants)];
  if (unique.length !== 6 || unique.some((email) => email.toLowerCase() !== lowered)) {
    throw new Error('need six distinct mixed-case spellings of one address');
  }
  return unique;
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  const helper = await prisma.fulfillmentUser.create({
    data: { name: 'Kris', email: `kris-${suffix}@fulfillment.test`, active: true },
  });

  await check('source: subscribe fail-closed before Mailchimp', () => {
    const src = fs.readFileSync(path.join(DEEPQUILL_ROOT, 'api', 'subscribe.cjs'), 'utf8');
    assert.match(src, /resolveSubscribePromotionalGate/);
    assert.match(src, /if \(!gate\.mailchimpAllowed\)/);
    assert.match(src, /Access granted\. We’ll finish sign-up shortly\./);
    assert.doesNotMatch(src, /eligibilityErr && eligibilityErr\.message/);
  });

  await check('canonical identity lookup does not silently truncate User, Customer, or conversion rows', () => {
    const src = fs.readFileSync(
      path.join(DEEPQUILL_ROOT, 'lib', 'readers', 'readerOutreachEligibility.cjs'),
      'utf8',
    );
    assert.doesNotMatch(src, /LIMIT 5/);
    assert.doesNotMatch(src, /LIMIT 10/);
    assert.match(src, /order\.findMany/);
    assert.match(src, /contestPlayerId/);
  });

  await check('confirmed eligible may reach Mailchimp', async () => {
    const user = await createUser('ok');
    const gate = await resolveSubscribePromotionalGate(prisma, user.email);
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.identity, 'found');
    assert.strictEqual(gate.reason, 'eligible');
    assert.strictEqual(gate.mailchimpAllowed, true);
    assert.strictEqual(gate.localAccess, true);
  });

  await check('confirmed archived grants local access and must not reach Mailchimp', async () => {
    const user = await createUser('arc');
    await writes.archiveReader({
      readerProfileId: user.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before subscribe gate check',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: `${suffix}-arch-sub`,
    });
    const gate = await resolveSubscribePromotionalGate(prisma, user.email);
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.reason, 'archived');
    assert.strictEqual(gate.mailchimpAllowed, false);
    assert.strictEqual(gate.localAccess, true);
    const body = subscribeLocalAccessResponse(gate);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.status, 'existing');
  });

  await check('confirmed independent DNC must not reach Mailchimp', async () => {
    const user = await createUser('dnc');
    await writes.addContactDecision({
      readerProfileId: user.readerProfile.id,
      decision: 'suppress',
      reason: 'Independent do not contact for subscribe',
      actorId: helper.id,
      idempotencyKey: `${suffix}-dnc-sub`,
    });
    const gate = await resolveSubscribePromotionalGate(prisma, user.email);
    assert.strictEqual(gate.reason, 'manual_dnc');
    assert.strictEqual(gate.mailchimpAllowed, false);
    assert.strictEqual(gate.localAccess, true);
  });

  await check('confirmed no existing identity may reach Mailchimp', async () => {
    const gate = await resolveSubscribePromotionalGate(prisma, `nobody-${suffix}@subscribe.test`);
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.identity, 'none');
    assert.strictEqual(gate.reason, 'no_existing_identity');
    assert.strictEqual(gate.mailchimpAllowed, true);
  });

  await check('database/eligibility lookup failure must not reach Mailchimp', async () => {
    const exploding = {
      user: {
        findUnique: async () => {
          throw new Error('synthetic eligibility lookup failure');
        },
      },
    };
    const gate = await resolveSubscribePromotionalGate(exploding, 'lookup.fail@subscribe.test');
    assert.strictEqual(gate.lookup, 'failed');
    assert.strictEqual(gate.reason, 'lookup_failed');
    assert.strictEqual(gate.mailchimpAllowed, false);
    assert.strictEqual(gate.localAccess, true);
    const body = subscribeLocalAccessResponse(gate);
    assert.strictEqual(body.status, 'soft-fail');
    assert.doesNotMatch(body.message, /synthetic eligibility lookup failure|prisma|SQLITE/i);
  });

  await check('User without profile is not reported as no existing identity', async () => {
    const token = `${suffix}noprof`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const user = await prisma.user.create({
      data: {
        email: `${token}@subscribe.test`,
        code: token,
        referralCode: token.toUpperCase(),
        fname: 'NoProfile',
        lname: 'Reader',
      },
    });
    const gate = await resolveSubscribePromotionalGate(prisma, user.email);
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.identity, 'found');
    assert.notStrictEqual(gate.reason, 'no_existing_identity');
    assert.strictEqual(gate.mailchimpAllowed, true);
  });

  await check('independent DNC on a User without a profile is not treated as unknown', async () => {
    const token = `${suffix}dncnop`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const user = await prisma.user.create({
      data: {
        email: `${token}@subscribe.test`,
        code: `${token}x`,
        referralCode: `${token}X`.toUpperCase(),
        fname: 'DncNoProfile',
        lname: 'Reader',
      },
    });
    await prisma.readerContactDecision.create({
      data: {
        userId: user.id,
        decision: 'suppress',
        reason: 'Independent DNC without a profile row',
        actorType: 'admin',
        actorLabel: 'test',
        origin: 'admin_decision',
        originRef: `${suffix}-dnc-noprof`,
      },
    });
    const gate = await resolveSubscribePromotionalGate(prisma, user.email);
    assert.strictEqual(gate.identity, 'found');
    assert.strictEqual(gate.reason, 'manual_dnc');
    assert.strictEqual(gate.mailchimpAllowed, false);
  });

  await check('mixed-case User.email still matches the archived reader', async () => {
    const token = `${suffix}mix`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const mixed = `Mix.${token}@Subscribe.TEST`;
    const user = await prisma.user.create({
      data: {
        email: mixed,
        code: `${token}m`,
        referralCode: `${token}M`,
        fname: 'Mixed',
        lname: 'Case',
        readerProfile: {
          create: { source: 'Website', readerType: 'interested', status: 'active' },
        },
      },
      include: { readerProfile: true },
    });
    await writes.archiveReader({
      readerProfileId: user.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive mixed-case email identity',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: `${suffix}-arch-mix`,
    });
    const gate = await resolveSubscribePromotionalGate(prisma, mixed.toLowerCase());
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.identity, 'found');
    assert.strictEqual(gate.reason, 'archived');
    assert.strictEqual(gate.mailchimpAllowed, false);
  });

  await check('linked Customer.email of an archived User is not treated as unknown', async () => {
    const token = `${suffix}cust`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const user = await createUser('cust');
    const customerEmail = `cust-alt-${token}@subscribe.test`;
    await prisma.customer.create({
      data: {
        email: customerEmail,
        userId: user.id,
        name: 'Linked Customer',
      },
    });
    await writes.archiveReader({
      readerProfileId: user.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive before customer-email subscribe',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: `${suffix}-arch-cust`,
    });
    const gate = await resolveSubscribePromotionalGate(prisma, customerEmail);
    assert.strictEqual(gate.identity, 'found');
    assert.strictEqual(gate.reason, 'archived');
    assert.strictEqual(gate.mailchimpAllowed, false);
    const { loadPromotionalIneligibleEmailSet } = require('../lib/readers/readerOutreachEligibility.cjs');
    const set = await loadPromotionalIneligibleEmailSet(prisma);
    assert.ok(set.has(customerEmail.toLowerCase()));
    assert.ok(set.has(user.email.toLowerCase()));
  });

  await check('conversion buyerEmail tied by purchase session matches the archived User', async () => {
    const token = `${suffix}conv`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const user = await createUser('conv');
    const buyerEmail = `buyer-${token}@subscribe.test`;
    const sessionId = `cs_${token}_conv`;
    const referrer = await prisma.user.create({
      data: {
        email: `ref-${token}@subscribe.test`,
        code: `${token}r`,
        referralCode: `${token}R`,
        fname: 'Referrer',
        lname: 'User',
      },
    });
    await prisma.purchase.create({
      data: {
        userId: user.id,
        sessionId,
        amount: 1999,
        currency: 'usd',
        source: 'stripe',
        saleStatus: 'live',
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
      reason: 'Archive before conversion-email subscribe',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: `${suffix}-arch-conv`,
    });
    const gate = await resolveSubscribePromotionalGate(prisma, buyerEmail);
    assert.strictEqual(gate.identity, 'found');
    assert.strictEqual(gate.reason, 'archived');
    assert.strictEqual(gate.mailchimpAllowed, false);
  });

  await check('ambiguous mixed-case User.email fails closed and does not reach Mailchimp', async () => {
    const token = `${suffix}amb`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const local = `amb.${token}`;
    await prisma.user.create({
      data: {
        email: `${local}@Subscribe.test`,
        code: `${token}a`,
        referralCode: `${token}A`,
        fname: 'AmbOne',
        lname: 'Reader',
      },
    });
    await prisma.user.create({
      data: {
        email: `${local}@subscribe.test`,
        code: `${token}b`,
        referralCode: `${token}B`,
        fname: 'AmbTwo',
        lname: 'Reader',
      },
    });
    const gate = await resolveSubscribePromotionalGate(prisma, `${local}@subscribe.test`);
    assert.strictEqual(gate.lookup, 'failed');
    assert.strictEqual(gate.reason, 'lookup_failed');
    assert.strictEqual(gate.mailchimpAllowed, false);
    assert.strictEqual(gate.localAccess, true);
  });

  await check('unlinked Customer.email is not treated as a reader identity', async () => {
    const token = `${suffix}ulnk`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
    const customerEmail = `unlinked-${token}@subscribe.test`;
    await prisma.customer.create({
      data: { email: customerEmail, name: 'Shopper Only' },
    });
    const gate = await resolveSubscribePromotionalGate(prisma, customerEmail);
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.identity, 'none');
    assert.strictEqual(gate.reason, 'no_existing_identity');
    assert.strictEqual(gate.mailchimpAllowed, true);
  });

  await check('more than five mixed-case User.email rows fail closed', async () => {
    const token = `${suffix}u6`.replace(/[^a-z0-9]/gi, '').slice(0, 18);
    const emails = mixedCaseEmails(`limu${token}`, 'subscribe.test');
    for (let i = 0; i < emails.length; i += 1) {
      await prisma.user.create({
        data: {
          email: emails[i],
          code: `${token}${i}u`,
          referralCode: `${token}${i}U`,
          fname: `LimitUser${i}`,
          lname: 'Reader',
        },
      });
    }
    const gate = await resolveSubscribePromotionalGate(prisma, emails[0].toLowerCase());
    assert.strictEqual(gate.lookup, 'failed');
    assert.strictEqual(gate.reason, 'lookup_failed');
    assert.strictEqual(gate.mailchimpAllowed, false);
    assert.strictEqual(gate.localAccess, true);
  });

  await check('more than five mixed-case linked Customer.email rows fail closed', async () => {
    const token = `${suffix}c6`.replace(/[^a-z0-9]/gi, '').slice(0, 18);
    const emails = mixedCaseEmails(`limc${token}`, 'subscribe.test');
    for (let i = 0; i < emails.length; i += 1) {
      const owner = await prisma.user.create({
        data: {
          email: `owner${i}-${token}@subscribe.test`,
          code: `${token}${i}c`,
          referralCode: `${token}${i}C`,
          fname: `Owner${i}`,
          lname: 'CustLimit',
        },
      });
      await prisma.customer.create({
        data: { email: emails[i], userId: owner.id, name: `Cust ${i}` },
      });
    }
    const gate = await resolveSubscribePromotionalGate(prisma, emails[0].toLowerCase());
    assert.strictEqual(gate.lookup, 'failed');
    assert.strictEqual(gate.reason, 'lookup_failed');
    assert.strictEqual(gate.mailchimpAllowed, false);
  });

  await check('more than ten conversion rows still match an Order-linked archived User', async () => {
    const token = `${suffix}cv11`.replace(/[^a-z0-9]/gi, '').slice(0, 18);
    const user = await createUser('cv11');
    const buyerEmail = `buyer11-${token}@subscribe.test`;
    const referrer = await prisma.user.create({
      data: {
        email: `ref11-${token}@subscribe.test`,
        code: `${token}r11`,
        referralCode: `${token}R11`,
        fname: 'Referrer',
        lname: 'Eleven',
      },
    });
    for (let i = 0; i < 10; i += 1) {
      await prisma.referralConversion.create({
        data: {
          referrerUserId: referrer.id,
          referralCode: referrer.referralCode,
          buyerEmail,
          stripeSessionId: `cs_${token}_orphan_${i}`,
          product: 'book',
        },
      });
    }
    const linkedSession = `cs_${token}_linked`;
    const customer = await prisma.customer.create({
      data: {
        email: `ord11-${token}@subscribe.test`,
        userId: user.id,
        name: 'Order Linked Eleven',
      },
    });
    await prisma.order.create({
      data: {
        customerId: customer.id,
        stripeSessionId: linkedSession,
      },
    });
    await prisma.referralConversion.create({
      data: {
        referrerUserId: referrer.id,
        referralCode: referrer.referralCode,
        buyerEmail,
        stripeSessionId: linkedSession,
        product: 'book',
      },
    });
    await writes.archiveReader({
      readerProfileId: user.readerProfile.id,
      reasonCode: 'test_record',
      reason: 'Archive after eleven conversion rows',
      expectedStatus: 'active',
      confirmed: true,
      actorId: helper.id,
      idempotencyKey: `${suffix}-arch-cv11`,
    });
    const gate = await resolveSubscribePromotionalGate(prisma, buyerEmail);
    assert.strictEqual(gate.lookup, 'ok');
    assert.strictEqual(gate.identity, 'found');
    assert.strictEqual(gate.reason, 'archived');
    assert.strictEqual(gate.mailchimpAllowed, false);
  });

  const exitCode = failed ? 1 : 0;
  if (failed) console.error(`\nverify-subscribe-promotional-gate: ${failed} failed, ${passed} passed`);
  else console.log(`\nverify-subscribe-promotional-gate: ${passed} passed`);
  await prisma.$disconnect();
  fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
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
