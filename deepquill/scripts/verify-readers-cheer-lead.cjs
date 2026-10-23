#!/usr/bin/env node
/**
 * Disposable-DB checks for /readers-cheer email capture.
 * Refuses deepquill/dev.db. Does not send mail.
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

function migrateDisposable() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-readers-cheer-'));
  const dbPath = path.join(tmpDir, 'readers-cheer.db');
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
  return { tmpDir, fileUrl };
}

process.env.STRIPE_SECRET_KEY = 'sk_test_local_readers_cheer_only';
process.env.FULFILLMENT_TOKEN_SECRET = 'local-readers-cheer-fulfillment-secret-32';
process.env.NODE_ENV = 'test';
delete process.env.NURTURE_PROMOTIONAL_SENDING;
delete process.env.PROMOTIONAL_SENDING_ENABLED;
delete process.env.TRANSACTIONAL_EMAIL_ENABLED;

const disposable = migrateDisposable();
process.env.DATABASE_URL = disposable.fileUrl;
delete globalThis.__prisma;

const { PrismaClient } = require('@prisma/client');
const handler = require('../api/readersAgree/lead.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');
const {
  classifyProspectEngagement,
  isReadersAgreeLeadAttribution,
  REASON,
  ENGAGEMENT,
} = require('../lib/readers/classifyProspectEngagement.cjs');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const suffix = `cheer${Date.now()}`;
const campaign = {
  utm_source: 'meta',
  utm_medium: 'carousel',
  utm_campaign: 'cheer-campaign',
  fbclid: 'fb-cheer-1',
  src: 'ig',
};

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

async function postLead(body) {
  const res = mockRes();
  await handler({ body, headers: {} }, res);
  return res;
}

function assertHub(res, label) {
  assert.strictEqual(res.statusCode, 200, `${label} status`);
  assert.strictEqual(res.body.ok, true, `${label} ok`);
  assert.ok(String(res.body.redirectPath).startsWith('/sample-chapters'), `${label} hub`);
  assert.ok(!String(res.body.redirectPath).includes('/read/'), `${label} not chapter 1`);
}

async function main() {
  const leadSrc = fs.readFileSync(path.join(DEEPQUILL_ROOT, 'api', 'readersAgree', 'lead.cjs'), 'utf8');
  assert.doesNotMatch(leadSrc, /sendEmail|mailchimp|runPromotionalNurture|messages\.send/);

  assert.strictEqual(
    isReadersAgreeLeadAttribution({
      capturedAt: '2026-10-23T00:00:00.000Z',
      captureSurface: 'cheer',
    }),
    true,
  );
  assert.strictEqual(
    isReadersAgreeLeadAttribution({
      capturedAt: '2026-10-23T00:00:00.000Z',
      captureSurface: 'landing',
    }),
    true,
  );
  assert.strictEqual(isReadersAgreeLeadAttribution({ captureSurface: 'cheer' }), false);
  assert.strictEqual(
    isReadersAgreeLeadAttribution({
      capturedAt: '2026-10-23T00:00:00.000Z',
      captureSurface: 'other',
    }),
    false,
  );

  const classified = classifyProspectEngagement({
    leadAttribution: {
      capturedAt: '2026-10-23T00:00:00.000Z',
      captureSurface: 'cheer',
      entryPage: '/readers-cheer',
      visitorId: 'visitor-cheer',
    },
    events: [
      {
        type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
        meta: { chapterId: '1' },
        createdAt: '2026-10-23T00:01:00.000Z',
      },
      {
        type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
        meta: { chapterId: '1', secondsOnPage: 50 },
        createdAt: '2026-10-23T00:02:00.000Z',
      },
      {
        type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
        meta: { chapterId: '2' },
        createdAt: '2026-10-23T00:03:00.000Z',
      },
      {
        type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
        meta: { chapterId: '2', secondsOnPage: 95 },
        createdAt: '2026-10-23T00:04:00.000Z',
      },
    ],
  });
  assert.strictEqual(classified.analyticsOnly, true);
  assert.strictEqual(classified.sampleEngaged, true);
  assert.strictEqual(classified.engagement, ENGAGEMENT.SAMPLE_ENGAGED);
  assert.deepStrictEqual(classified.chaptersSampled, ['1', '2']);
  assert.ok(classified.reasons.includes(REASON.EMAIL_CAPTURED));
  assert.ok(classified.reasons.includes(REASON.DWELL_90S));
  assert.ok(classified.reasons.includes(REASON.CHAPTER_OPENED));

  const invalid = await postLead({ email: 'not-an-email', captureSurface: 'cheer' });
  assert.strictEqual(invalid.statusCode, 400);
  assert.strictEqual(invalid.body.ok, false);
  assert.strictEqual(await prisma.user.count(), 0);

  const email = `cheer-new-${suffix}@example.test`;
  const created = await postLead({
    email,
    captureSurface: 'cheer',
    visitorId: 'visitor-cheer-1',
    ref: 'refcheer',
    utm: campaign,
  });
  assertHub(created, 'create');
  assert.strictEqual(created.body.promotionalConsent, 'not_requested');
  assert.ok(created.body.redirectPath.includes('utm_campaign=cheer-campaign'));
  assert.ok(created.body.redirectPath.includes('fbclid=fb-cheer-1'));
  assert.ok(created.body.redirectPath.includes('utm_source=meta'));
  assert.strictEqual(await prisma.user.count({ where: { email } }), 1);
  assert.strictEqual(await prisma.readerProfile.count(), 1);
  assert.strictEqual(await prisma.readerCommunication.count(), 0);

  const profile = await prisma.readerProfile.findFirst({
    select: {
      readerType: true,
      source: true,
      leadAttribution: true,
      emailMarketingConsentAt: true,
      emailMarketingConsentSource: true,
      prospectNurtureEnrolledAt: true,
      prospectNurtureLastSentAt: true,
    },
  });
  assert.strictEqual(profile.readerType, 'prospect');
  assert.strictEqual(profile.source, 'readers-agree-v2');
  assert.strictEqual(profile.leadAttribution.entryPage, '/readers-cheer');
  assert.strictEqual(profile.leadAttribution.captureSurface, 'cheer');
  assert.strictEqual(profile.leadAttribution.utm_campaign, 'cheer-campaign');
  assert.strictEqual(profile.leadAttribution.fbclid, 'fb-cheer-1');
  assert.strictEqual(profile.leadAttribution.channel, 'meta');
  assert.strictEqual(profile.emailMarketingConsentAt, null);
  assert.strictEqual(profile.emailMarketingConsentSource, null);
  assert.strictEqual(profile.prospectNurtureEnrolledAt, null);
  assert.strictEqual(profile.prospectNurtureLastSentAt, null);

  const firstEvent = await prisma.event.findFirst({
    where: { type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED },
  });
  assert.strictEqual(firstEvent.userId, created.body.userId);
  assert.strictEqual(firstEvent.meta.entryPage, '/readers-cheer');
  assert.strictEqual(firstEvent.meta.captureSurface, 'cheer');
  assert.strictEqual(firstEvent.meta.destination, 'sample-chapters');

  const repeated = await postLead({
    email,
    captureSurface: 'cheer',
    visitorId: 'visitor-cheer-2',
    promotionalOptIn: false,
  });
  assertHub(repeated, 'repeat');
  assert.strictEqual(repeated.body.userId, created.body.userId);
  assert.strictEqual(repeated.body.promotionalConsent, 'not_requested');
  assert.strictEqual(repeated.body.redirectPath, '/sample-chapters');
  assert.strictEqual(await prisma.user.count({ where: { email } }), 1);
  assert.strictEqual(await prisma.readerProfile.count(), 1);

  const kept = await prisma.readerProfile.findFirst({ select: { leadAttribution: true } });
  assert.strictEqual(kept.leadAttribution.utm_campaign, 'cheer-campaign');
  assert.strictEqual(kept.leadAttribution.fbclid, 'fb-cheer-1');
  assert.strictEqual(kept.leadAttribution.utm_source, 'meta');
  assert.strictEqual(kept.leadAttribution.ref, 'refcheer');
  assert.strictEqual(kept.leadAttribution.channel, 'meta');
  assert.strictEqual(kept.leadAttribution.entryPage, '/readers-cheer');
  assert.strictEqual(kept.leadAttribution.captureSurface, 'cheer');

  const repeatEvent = await prisma.event.findFirst({
    where: { type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED },
    orderBy: { createdAt: 'desc' },
  });
  assert.strictEqual(repeatEvent.meta.priorEmailSubmitCount, 1);
  assert.strictEqual(repeatEvent.meta.entryPage, '/readers-cheer');

  const opted = `cheer-opt-${suffix}@example.test`;
  const optIn = await postLead({
    email: opted,
    captureSurface: 'cheer',
    promotionalOptIn: true,
    utm: { utm_campaign: 'opt-in-campaign' },
  });
  assertHub(optIn, 'opt-in');
  assert.strictEqual(optIn.body.promotionalConsent, 'recorded');
  const optedProfile = await prisma.readerProfile.findFirst({
    where: { user: { email: opted } },
    select: {
      emailMarketingConsentAt: true,
      emailMarketingConsentSource: true,
      prospectNurtureEnrolledAt: true,
    },
  });
  assert.ok(optedProfile.emailMarketingConsentAt);
  assert.strictEqual(optedProfile.emailMarketingConsentSource, 'jody-reading-access');
  assert.strictEqual(optedProfile.prospectNurtureEnrolledAt, null);

  const declined = `cheer-off-${suffix}@example.test`;
  const optOut = await postLead({
    email: declined,
    captureSurface: 'cheer',
    promotionalOptIn: false,
  });
  assertHub(optOut, 'unchecked');
  assert.strictEqual(optOut.body.promotionalConsent, 'not_requested');
  const declinedProfile = await prisma.readerProfile.findFirst({
    where: { user: { email: declined } },
    select: { emailMarketingConsentAt: true, emailMarketingConsentSource: true },
  });
  assert.strictEqual(declinedProfile.emailMarketingConsentAt, null);
  assert.strictEqual(declinedProfile.emailMarketingConsentSource, null);

  const landingEmail = `cheer-landing-${suffix}@example.test`;
  const landingFirst = await postLead({
    email: landingEmail,
    captureSurface: 'landing',
    utm: { utm_campaign: 'agree-campaign', utm_source: 'meta', fbclid: 'fb-agree' },
  });
  assertHub(landingFirst, 'landing');
  assert.strictEqual(landingFirst.body.promotionalConsent, 'not_requested');
  const landingSecond = await postLead({
    email: landingEmail,
    captureSurface: 'landing',
  });
  assertHub(landingSecond, 'landing-replace');
  const landingProfile = await prisma.readerProfile.findFirst({
    where: { user: { email: landingEmail } },
    select: { leadAttribution: true },
  });
  assert.strictEqual(landingProfile.leadAttribution.captureSurface, 'landing');
  assert.strictEqual(landingProfile.leadAttribution.utm_campaign, null);
  assert.strictEqual(landingProfile.leadAttribution.entryPage, undefined);

  assert.strictEqual(await prisma.user.count({ where: { email } }), 1);
  assert.strictEqual(await prisma.readerCommunication.count(), 0);
  assert.strictEqual(await prisma.readerProfile.count({ where: { prospectNurtureEnrolledAt: { not: null } } }), 0);

  console.log('verify-readers-cheer-lead: passed');
}

main()
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
