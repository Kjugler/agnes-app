/**
 * Disposable-database demonstration.
 * A confirmed purchase leaves the prospect ladder.
 * The same consenting purchaser can receive Text a Friend once and the review
 * request once. Repeat runs do not send either message again.
 * No Mailchimp call. Both production switches stay unset.
 *
 * Usage: node scripts/verify-purchaser-nurture-followup.cjs
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const DAY_MS = 24 * 60 * 60 * 1000;
const POSTAL = '100 Dry Run Street, Test City, TS 00000';
const REPLY_TO = 'monitored-reply@agnes-dry-run.invalid';

function isCanonicalDevDb(url) {
  const raw = String(url || '');
  const normalized = raw.replace(/\\/g, '/').toLowerCase();
  if (!raw) return false;
  if (normalized.includes('/temp/') || normalized.includes('/tmp/')) return false;
  if (normalized.includes('deepquill/dev.db')) return true;
  if (/file:\.?\/?dev\.db$/.test(normalized)) return true;
  try {
    const withoutFile = raw.replace(/^file:/i, '').replace(/\?.*$/, '');
    if (path.resolve(DEEPQUILL_ROOT, withoutFile) === path.resolve(DEV_DB)) return true;
  } catch {
    return false;
  }
  return false;
}

if (String(process.env.DATABASE_URL || '').startsWith('postgres')) {
  throw new Error('This demonstration uses a disposable database only');
}

function migrateDisposable() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-purchaser-nurture-'));
  const dbPath = path.join(tmpDir, 'purchaser-nurture.db');
  const fileUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  if (!fileUrl.startsWith('file:') || isCanonicalDevDb(fileUrl)) {
    throw new Error('Refusing to run against the normal local deepquill/dev.db');
  }
  const prismaCli = path.join(DEEPQUILL_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: DEEPQUILL_ROOT,
    env: { ...process.env, DATABASE_URL: fileUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${(result.stderr || result.stdout || '').slice(-1500)}`);
  }
  return fileUrl;
}

delete process.env.PROMOTIONAL_SENDING_ENABLED;
delete process.env.NURTURE_PROMOTIONAL_SENDING;
delete process.env.PROMOTIONAL_POSTAL_ADDRESS;
delete process.env.PROMOTIONAL_REPLY_TO;
delete process.env.TRANSACTIONAL_EMAIL_ENABLED;
process.env.SITE_URL = 'https://www.theagnesprotocol.com';
process.env.NEXT_PUBLIC_SITE_URL = 'https://www.theagnesprotocol.com';
process.env.APP_BASE_URL = 'https://www.theagnesprotocol.com';
process.env.FULFILLMENT_TOKEN_SECRET = 'local-purchaser-followup-secret-32';
process.env.PROMOTIONAL_UNSUBSCRIBE_SECRET = 'local-purchaser-unsubscribe-secret';
process.env.NODE_ENV = 'test';

const fileUrl = migrateDisposable();
process.env.DATABASE_URL = fileUrl;
delete globalThis.__prisma;

const { PrismaClient } = require('@prisma/client');
const handler = require('../api/readersAgree/lead.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');
const { decideReaderNurture, DECISION, TREATMENT } = require('../lib/readers/nurtureDecision.cjs');
const { runPromotionalNurture } = require('../lib/readers/runPromotionalNurture.cjs');
const { masterPromotionalSendingEnabled } = require('../lib/readers/promotionalActivation.cjs');
const { nurturingSendEnabled } = require('../lib/readers/nurtureActivation.cjs');

const prisma = new PrismaClient({ datasources: { db: { url: fileUrl } } });
const suffix = Date.now();
const providerClear = { checked: true, suppressed: false };
const captured = [];

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

function runnerDeps() {
  return {
    sendingEnabled: true,
    masterEnabled: true,
    checkTransactionalSuppression: async () => providerClear,
    send(payload) {
      captured.push({
        subject: payload.subject,
        text: payload.text,
        replyTo: payload.replyTo || null,
      });
    },
  };
}

async function main() {
  assert.equal(masterPromotionalSendingEnabled(), false);
  assert.equal(nurturingSendEnabled(), false);

  const email = `purchaser.followup.${suffix}@agnes-dry-run.invalid`;
  const res = mockRes();
  await handler({
    body: {
      email,
      captureSurface: 'cheer',
      visitorId: `visitor-purchaser-${suffix}`,
      promotionalOptIn: true,
    },
    headers: { 'x-readers-agree-issue-session': '1' },
  }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.promotionalConsent, 'recorded');

  const user = await prisma.user.findUnique({ where: { email } });
  assert.ok(user);
  const personalCode = `DRY${String(suffix).slice(-6)}`;
  await prisma.user.update({
    where: { id: user.id },
    data: { referralCode: personalCode },
  });

  const tafNow = new Date('2026-10-26T16:00:00.000Z');
  const purchasedAt = new Date(tafNow.getTime() - 28 * DAY_MS);
  await prisma.readerProfile.update({
    where: { userId: user.id },
    data: { emailMarketingConsentAt: purchasedAt },
  });
  await prisma.event.updateMany({
    where: { userId: user.id },
    data: { createdAt: purchasedAt },
  });
  await prisma.event.create({
    data: {
      userId: user.id,
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
      meta: { chapterId: '1' },
      createdAt: purchasedAt,
    },
  });
  await prisma.event.create({
    data: {
      userId: user.id,
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
      meta: { chapterId: '1', secondsOnPage: 40 },
      createdAt: new Date(purchasedAt.getTime() + 60 * 1000),
    },
  });
  await prisma.event.create({
    data: {
      userId: user.id,
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
      meta: { chapterId: '2' },
      createdAt: new Date(purchasedAt.getTime() + 2 * 60 * 1000),
    },
  });
  await prisma.event.create({
    data: {
      userId: user.id,
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
      meta: { chapterId: '2', secondsOnPage: 95 },
      createdAt: new Date(purchasedAt.getTime() + 3 * 60 * 1000),
    },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Purchase" ("id", "userId", "sessionId", "amount", "currency", "source", "createdAt", "saleStatus", "fulfillmentStatus", "countsForShipping", "countsForPoints")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `pur_${suffix}`,
    user.id,
    `cs_purchaser_${suffix}`,
    2195,
    'usd',
    'stripe',
    purchasedAt.toISOString(),
    'live',
    'active',
    1,
    1,
  );

  const profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
  const events = await prisma.event.findMany({ where: { userId: user.id } });
  const codedUser = await prisma.user.findUnique({ where: { id: user.id } });
  const prospectIfUnpurchased = decideReaderNurture({
    readerRef: codedUser.id,
    now: tafNow.toISOString(),
    email: codedUser.email,
    profile,
    purchases: [],
    evidence: [],
    leadAttribution: profile.leadAttribution,
    events,
    communications: [],
    emailMarketingConsentAt: profile.emailMarketingConsentAt,
    emailMarketingConsentSource: profile.emailMarketingConsentSource,
    ownReferralCode: codedUser.referralCode,
    providerSuppression: providerClear,
  });
  assert.strictEqual(prospectIfUnpurchased.category, 'prospect_nurture');
  assert.notStrictEqual(prospectIfUnpurchased.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);

  const purchased = decideReaderNurture({
    readerRef: codedUser.id,
    now: tafNow.toISOString(),
    email: codedUser.email,
    profile,
    purchases: [{ sessionId: `cs_purchaser_${suffix}`, saleStatus: 'live', purchasedAt: purchasedAt.toISOString() }],
    evidence: [],
    leadAttribution: profile.leadAttribution,
    events,
    communications: [],
    emailMarketingConsentAt: profile.emailMarketingConsentAt,
    emailMarketingConsentSource: profile.emailMarketingConsentSource,
    confirmedPurchaseAt: purchasedAt.toISOString(),
    ownReferralCode: codedUser.referralCode,
    providerSuppression: providerClear,
  });
  assert.strictEqual(purchased.finalDecision, DECISION.HOLD);
  assert.strictEqual(purchased.canSendPromotional, true);
  assert.strictEqual(purchased.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);
  assert.strictEqual(purchased.category, 'reader_recommendation_taf');

  const early = await runPromotionalNurture(prisma, {
    now: new Date(purchasedAt.getTime() + DAY_MS).toISOString(),
    postalAddress: POSTAL,
    replyTo: REPLY_TO,
    siteUrl: 'https://www.theagnesprotocol.com',
  }, runnerDeps());
  assert.strictEqual(early.sent, 0);
  assert.strictEqual(captured.length, 0);
  assert.strictEqual(await prisma.readerCommunication.count({
    where: { userId: user.id, category: 'prospect_nurture' },
  }), 0);

  const firstFriend = await runPromotionalNurture(prisma, {
    now: tafNow.toISOString(),
    postalAddress: POSTAL,
    replyTo: REPLY_TO,
    siteUrl: 'https://www.theagnesprotocol.com',
  }, runnerDeps());
  assert.strictEqual(firstFriend.sent, 1);
  assert.strictEqual(captured.length, 1);
  assert.match(captured[0].text, /It's Jody\./);
  assert.doesNotMatch(captured[0].text, /It's Jody again/);
  assert.match(captured[0].text, /15% on their paperback purchase/);
  assert.match(captured[0].text, new RegExp(`/text-a-friend\\?ref=${personalCode}`));
  assert.strictEqual(captured[0].replyTo, REPLY_TO);
  assert.strictEqual(await prisma.readerCommunication.count({
    where: { userId: user.id, category: 'prospect_nurture' },
  }), 0);
  assert.strictEqual(await prisma.readerCommunication.count({
    where: { userId: user.id, category: 'reader_recommendation_taf', outcome: 'accepted' },
  }), 1);

  const duplicateFriend = await runPromotionalNurture(prisma, {
    now: new Date(tafNow.getTime() + 5 * DAY_MS).toISOString(),
    postalAddress: POSTAL,
    replyTo: REPLY_TO,
    siteUrl: 'https://www.theagnesprotocol.com',
  }, runnerDeps());
  assert.strictEqual(duplicateFriend.sent, 0);
  assert.strictEqual(captured.length, 1);

  const friendRow = await prisma.readerCommunication.findFirst({
    where: { userId: user.id, category: 'reader_recommendation_taf', outcome: 'accepted' },
    select: { occurredAt: true },
  });
  const reviewNow = new Date(friendRow.occurredAt.getTime() + 14 * DAY_MS);
  const firstReview = await runPromotionalNurture(prisma, {
    now: reviewNow.toISOString(),
    postalAddress: POSTAL,
    replyTo: REPLY_TO,
    siteUrl: 'https://www.theagnesprotocol.com',
  }, runnerDeps());
  assert.strictEqual(firstReview.sent, 1);
  assert.strictEqual(captured.length, 2);
  assert.strictEqual(captured[1].subject, 'A small favor from Jody');
  assert.match(captured[1].text, /It's Jody again\./);
  assert.match(captured[1].text, /no reward attached/);
  assert.doesNotMatch(captured[1].text, /15%/);
  assert.strictEqual(await prisma.readerCommunication.count({
    where: { userId: user.id, category: 'review_invitation', outcome: 'accepted' },
  }), 1);

  const duplicateReview = await runPromotionalNurture(prisma, {
    now: new Date(reviewNow.getTime() + 30 * DAY_MS).toISOString(),
    postalAddress: POSTAL,
    replyTo: REPLY_TO,
    siteUrl: 'https://www.theagnesprotocol.com',
  }, runnerDeps());
  assert.strictEqual(duplicateReview.sent, 0);
  assert.strictEqual(captured.length, 2);
  assert.strictEqual(await prisma.readerCommunication.count({ where: { userId: user.id } }), 2);
  assert.equal(masterPromotionalSendingEnabled(), false);
  assert.equal(nurturingSendEnabled(), false);

  console.log(JSON.stringify({
    pass: true,
    prospectSuppressed: true,
    textAFriendSent: 1,
    textAFriendRepeat: 0,
    reviewSent: 1,
    reviewRepeat: 0,
    greetingFirst: "It's Jody.",
    greetingAfterPriorMessage: "It's Jody again.",
  }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
