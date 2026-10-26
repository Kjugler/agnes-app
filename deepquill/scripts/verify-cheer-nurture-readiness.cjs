/**
 * Dry-run trace for a consenting /readers-cheer reader.
 * Disposable database. No Mailchimp call. Both production switches stay unset.
 *
 * Usage: node scripts/verify-cheer-nurture-readiness.cjs
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(DEEPQUILL_ROOT, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const SITE = 'https://www.theagnesprotocol.com';
const POSTAL = '100 Dry Run Street, Test City, TS 00000';

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

function migrateDisposable() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-nurture-readiness-'));
  const dbPath = path.join(tmpDir, 'nurture-readiness.db');
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
delete process.env.TRANSACTIONAL_EMAIL_ENABLED;
process.env.SITE_URL = 'https://www.theagnesprotocol.com';
process.env.NEXT_PUBLIC_SITE_URL = 'https://www.theagnesprotocol.com';
process.env.APP_BASE_URL = 'https://www.theagnesprotocol.com';
process.env.STRIPE_SECRET_KEY = 'sk_test_local_nurture_readiness_only';
process.env.FULFILLMENT_TOKEN_SECRET = 'local-nurture-readiness-fulfillment-32';
process.env.PROMOTIONAL_UNSUBSCRIBE_SECRET = 'local-nurture-readiness-unsubscribe';
process.env.NODE_ENV = 'test';

const fileUrl = migrateDisposable();
process.env.DATABASE_URL = fileUrl;
delete globalThis.__prisma;

const { PrismaClient } = require('@prisma/client');
const handler = require('../api/readersAgree/lead.cjs');
const unsubscribeHandler = require('../api/promotionalEmail/unsubscribe.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');
const { decideReaderNurture, DECISION, TREATMENT } = require('../lib/readers/nurtureDecision.cjs');
const { runPromotionalNurture } = require('../lib/readers/runPromotionalNurture.cjs');
const { buildNurtureMessage } = require('../lib/email/builders/nurtureMessage.cjs');
const {
  buildPromotionalOneClickUnsubscribeUrl,
  signPromotionalUnsubscribeToken,
  verifyPromotionalUnsubscribeToken,
} = require('../lib/readers/promotionalUnsubscribeToken.cjs');
const { buildTextAFriendUrl } = require('../lib/readers/readerUrls.cjs');
const { masterPromotionalSendingEnabled } = require('../lib/readers/promotionalActivation.cjs');
const { nurturingSendEnabled } = require('../lib/readers/nurtureActivation.cjs');

const prisma = new PrismaClient({ datasources: { db: { url: fileUrl } } });
const suffix = Date.now();
const providerClear = { checked: true, suppressed: false };

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
  await handler({ body, headers: { 'x-readers-agree-issue-session': '1' } }, res);
  return res;
}

async function addEvent(userId, type, meta, createdAt) {
  return prisma.event.create({
    data: { userId, type, meta, createdAt },
  });
}

function decisionInput(user, profile, events, extra = {}) {
  return {
    readerRef: user.id,
    now: extra.now,
    email: user.email,
    profile,
    purchases: extra.purchases || [],
    evidence: extra.evidence || [],
    leadAttribution: profile.leadAttribution,
    events,
    communications: extra.communications || [],
    emailMarketingConsentAt: profile.emailMarketingConsentAt,
    emailMarketingConsentSource: profile.emailMarketingConsentSource,
    emailMarketingOptOutAt: profile.emailMarketingOptOutAt,
    emailMarketingOptOutSource: profile.emailMarketingOptOutSource,
    confirmedPurchaseAt: extra.confirmedPurchaseAt || null,
    ownReferralCode: extra.ownReferralCode || '',
    providerSuppression: providerClear,
  };
}

function readText(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

async function main() {
  assert.equal(masterPromotionalSendingEnabled(), false);
  assert.equal(nurturingSendEnabled(), false);

  const agreeCapture = readText('agnes-next/src/components/readers-agree/ReadersAgreeEmailCapture.tsx');
  const cheerCapture = readText('agnes-next/src/components/readers-agree/ReadersCheerEmailCapture.tsx');
  const agreePage = readText('agnes-next/src/app/readers-agree/page.tsx');
  const cheerPage = readText('agnes-next/src/app/readers-cheer/page.tsx');
  const reader = readText('agnes-next/src/components/sample-chapters/SampleChapterReader.tsx');
  assert.doesNotMatch(agreeCapture, /type="email"/);
  assert.match(agreeCapture, /No email needed to begin/);
  assert.doesNotMatch(agreePage, /entry="cheer"/);
  assert.match(cheerCapture, /type="email"/);
  assert.match(cheerCapture, /captureSurface: 'cheer'/);
  assert.match(cheerPage, /entry="cheer"/);
  assert.match(reader, /sampleChapterEmailPromptVisible/);
  assert.match(reader, /recognized: access === 'recognized'/);

  const campaign = {
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'readers-cheer-approved',
    fbclid: 'fb-dry-run',
  };
  const chapterEmail = `cheer.chapters.${suffix}@agnes-dry-run.invalid`;
  const accessEmail = `cheer.access.${suffix}@agnes-dry-run.invalid`;
  const giftEmail = `cheer.gift.${suffix}@agnes-dry-run.invalid`;
  const buyerEmail = `cheer.buyer.${suffix}@agnes-dry-run.invalid`;

  const created = await postLead({
    email: chapterEmail,
    captureSurface: 'cheer',
    visitorId: 'visitor-cheer-ready',
    ref: 'adref',
    promotionalOptIn: true,
    utm: campaign,
  });
  assert.strictEqual(created.statusCode, 200);
  assert.strictEqual(created.body.promotionalConsent, 'recorded');
  assert.ok(String(created.body.redirectPath).startsWith('/sample-chapters'));
  assert.equal(typeof created.body.sessionToken, 'string');
  assert.ok(created.body.redirectPath.includes('utm_campaign=readers-cheer-approved'));
  assert.ok(created.body.redirectPath.includes('fbclid=fb-dry-run'));

  const access = await postLead({
    email: accessEmail,
    captureSurface: 'cheer',
    promotionalOptIn: false,
    utm: campaign,
  });
  assert.strictEqual(access.body.promotionalConsent, 'not_requested');

  const landing = await postLead({
    email: `cheer.landing.${suffix}@agnes-dry-run.invalid`,
    captureSurface: 'landing',
    utm: { utm_campaign: 'readers-agree' },
  });
  assert.strictEqual(landing.statusCode, 200);
  assert.strictEqual(landing.body.promotionalConsent, 'not_requested');
  assert.ok(String(landing.body.redirectPath).startsWith('/sample-chapters'));

  const chapterUser = await prisma.user.findUnique({ where: { email: chapterEmail } });
  const chapterProfile = await prisma.readerProfile.findUnique({ where: { userId: chapterUser.id } });
  assert.strictEqual(chapterProfile.leadAttribution.captureSurface, 'cheer');
  assert.strictEqual(chapterProfile.leadAttribution.entryPage, '/readers-cheer');
  assert.strictEqual(chapterProfile.leadAttribution.utm_campaign, 'readers-cheer-approved');
  assert.strictEqual(chapterProfile.leadAttribution.fbclid, 'fb-dry-run');
  assert.strictEqual(chapterProfile.emailMarketingConsentSource, 'jody-reading-access');
  assert.ok(chapterProfile.emailMarketingConsentAt);
  assert.strictEqual(chapterProfile.prospectNurtureEnrolledAt, null);
  assert.strictEqual(await prisma.readerCommunication.count(), 0);

  const accessProfile = await prisma.readerProfile.findFirst({
    where: { user: { email: accessEmail } },
  });
  assert.strictEqual(accessProfile.emailMarketingConsentAt, null);
  assert.strictEqual(accessProfile.prospectNurtureEnrolledAt, null);

  const anchor = new Date('2026-10-20T16:00:00.000Z');
  const emailEvent = await prisma.event.findFirst({
    where: { userId: chapterUser.id, type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED },
  });
  await prisma.event.update({ where: { id: emailEvent.id }, data: { createdAt: anchor } });
  emailEvent.createdAt = anchor;
  await addEvent(chapterUser.id, FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN, { chapterId: '1' }, anchor);
  await addEvent(
    chapterUser.id,
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
    { chapterId: '1', secondsOnPage: 40 },
    new Date(anchor.getTime() + 60 * 1000),
  );
  await addEvent(
    chapterUser.id,
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
    { chapterId: '2' },
    new Date(anchor.getTime() + 2 * 60 * 1000),
  );
  await addEvent(
    chapterUser.id,
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
    { chapterId: '2', secondsOnPage: 95 },
    new Date(anchor.getTime() + 3 * 60 * 1000),
  );

  const events = await prisma.event.findMany({ where: { userId: chapterUser.id }, orderBy: { createdAt: 'asc' } });
  const freshProfile = await prisma.readerProfile.findUnique({ where: { userId: chapterUser.id } });
  const tooSoon = decideReaderNurture(decisionInput(chapterUser, freshProfile, events, { now: anchor.toISOString() }));
  assert.strictEqual(tooSoon.classification.engagement, 'sample_engaged');
  assert.deepStrictEqual(tooSoon.classification.ownership, 'non_purchaser');
  assert.strictEqual(tooSoon.recommendedTreatment, TREATMENT.MULTI_CHAPTER);
  assert.strictEqual(tooSoon.finalDecision, DECISION.NOT_YET);

  const due = decideReaderNurture(decisionInput(chapterUser, freshProfile, events, { now: tooSoon.recommendedTiming }));
  assert.strictEqual(due.finalDecision, DECISION.HOLD);
  assert.strictEqual(due.canSendPromotional, true);
  assert.strictEqual(due.recommendedTreatment, TREATMENT.MULTI_CHAPTER);
  assert.strictEqual(due.category, 'prospect_nurture');
  assert.strictEqual(due.sendsEmail, false);

  const emailOnly = decideReaderNurture(decisionInput(chapterUser, freshProfile, [emailEvent], {
    now: new Date(anchor.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  }));
  assert.strictEqual(emailOnly.classification.engagement, 'identified');
  assert.strictEqual(emailOnly.recommendedTreatment, TREATMENT.IDENTIFIED_FOLLOWUP);
  assert.strictEqual(emailOnly.finalDecision, DECISION.NOT_YET);
  const identifiedDue = decideReaderNurture(decisionInput(chapterUser, freshProfile, [emailEvent], {
    now: emailOnly.recommendedTiming,
  }));
  assert.strictEqual(identifiedDue.finalDecision, DECISION.HOLD);
  assert.strictEqual(identifiedDue.recommendedTreatment, TREATMENT.IDENTIFIED_FOLLOWUP);

  const accessUser = await prisma.user.findUnique({ where: { email: accessEmail } });
  const accessEvents = await prisma.event.findMany({ where: { userId: accessUser.id } });
  const accessDecision = decideReaderNurture(decisionInput(accessUser, accessProfile, accessEvents, {
    now: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  }));
  assert.strictEqual(accessDecision.canSendPromotional, false);
  assert.strictEqual(accessDecision.reason, 'reading_access_email_is_not_marketing_consent');
  assert.strictEqual(accessDecision.finalDecision, DECISION.HOLD);
  assert.strictEqual(accessDecision.recommendedTreatment, TREATMENT.IDENTIFIED_FOLLOWUP);

  const message = buildNurtureMessage({
    treatment: due.recommendedTreatment,
    unsubscribeUrl: `${SITE}/preferences/unsubscribe?token=dry-run-token`,
    siteUrl: SITE,
    postalAddress: POSTAL,
  });
  assert.strictEqual(message.subject, "You're starting to see the pieces...");
  assert.match(message.html, /https:\/\/www\.theagnesprotocol\.com\/sample-chapters/);
  assert.match(message.html, /https:\/\/www\.theagnesprotocol\.com\/"/);
  assert.match(message.text, /Unsubscribe: https:\/\/www\.theagnesprotocol\.com\/preferences\/unsubscribe\?token=/);
  assert.match(message.html, /DeepQuill LLC/);
  assert.match(message.html, /100 Dry Run Street/);
  for (const fileName of ['jody-em1.png', 'jody-em12.png', 'jody-em2.png', 'jody-fb.png', 'jody-ig.png', 'jody-tiktok.png']) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'agnes-next', 'public', 'jody-icons', fileName)),
      fileName,
    );
  }
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'agnes-next', 'src', 'app', 'sample-chapters', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'agnes-next', 'src', 'app', 'catalog', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'agnes-next', 'src', 'app', 'preferences', 'unsubscribe', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'agnes-next', 'src', 'app', 'text-a-friend', 'page.tsx')));

  const sequence = [
    ['identified_followup', 'A little something from Jody', '/sample-chapters'],
    ['qualified_reading', 'Picking up the thread', '/sample-chapters'],
    ['multi_chapter_reading', "You're starting to see the pieces...", '/sample-chapters'],
    ['retailer_return', "There's something waiting for you...", '/sample-chapters'],
    ['buy_intent', 'A little something worth knowing about The Agnes Protocol', '/catalog'],
    ['checkout_resume', "Whenever you're ready", '/catalog'],
    ['honest_review_day_42', 'A small favor from Jody', 'amazon.com'],
  ];
  const rendered = [];
  for (const [treatment, subject, link] of sequence) {
    const built = buildNurtureMessage({
      treatment,
      unsubscribeUrl: `${SITE}/preferences/unsubscribe?token=dry-run-token`,
      siteUrl: SITE,
      textAFriendUrl: treatment === 'text_a_friend_day_28' ? `${SITE}/text-a-friend?code=ADA123` : null,
      postalAddress: POSTAL,
    });
    assert.ok(built, treatment);
    assert.strictEqual(built.subject, subject);
    assert.match(built.html, /<a href=/);
    assert.match(built.text, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    rendered.push({ treatment, subject, hasUnsubscribe: built.text.includes('/preferences/unsubscribe') });
  }
  const friendUrl = buildTextAFriendUrl('ADA123');
  const friend = buildNurtureMessage({
    treatment: 'text_a_friend_day_28',
    unsubscribeUrl: `${SITE}/preferences/unsubscribe?token=dry-run-token`,
    siteUrl: SITE,
    textAFriendUrl: friendUrl,
    postalAddress: POSTAL,
  });
  assert.strictEqual(friend.subject, "If you know someone who'd love this story");
  assert.match(friend.text, /\/text-a-friend\?ref=ADA123/);
  assert.equal(
    buildNurtureMessage({
      treatment: 'text_a_friend_day_28',
      unsubscribeUrl: `${SITE}/preferences/unsubscribe?token=dry-run-token`,
      siteUrl: SITE,
      textAFriendUrl: null,
      postalAddress: POSTAL,
    }),
    null,
  );

  const oneClick = buildPromotionalOneClickUnsubscribeUrl({
    userId: chapterUser.id,
    email: chapterEmail,
    siteUrl: SITE,
  });
  assert.match(oneClick, /\/api\/promotional-email\/unsubscribe\?token=/);
  const oneClickToken = new URL(oneClick).searchParams.get('token');
  assert.strictEqual(verifyPromotionalUnsubscribeToken(oneClickToken).userId, chapterUser.id);
  const expired = signPromotionalUnsubscribeToken({
    userId: chapterUser.id,
    email: chapterEmail,
    now: new Date('2020-01-01T00:00:00.000Z'),
  });
  assert.equal(verifyPromotionalUnsubscribeToken(expired), null);
  assert.equal(verifyPromotionalUnsubscribeToken(`${oneClickToken}x`), null);

  const closedSends = [];
  const closed = await runPromotionalNurture(prisma, { now: due.recommendedTiming, postalAddress: POSTAL }, {
    send() {
      closedSends.push('sent');
      throw new Error('promotional mail must not send while the switches are off');
    },
  });
  assert.strictEqual(closed.enabled, false);
  assert.strictEqual(closed.sent, 0);
  assert.strictEqual(closed.reason, 'promotional_sending_disabled');
  assert.strictEqual(closedSends.length, 0);

  const gift = await postLead({
    email: giftEmail,
    captureSurface: 'cheer',
    promotionalOptIn: true,
  });
  assert.strictEqual(gift.body.promotionalConsent, 'recorded');
  const giftUser = await prisma.user.findUnique({ where: { email: giftEmail } });
  await prisma.readerEvidence.create({
    data: {
      userId: giftUser.id,
      kind: 'gift_book_owner',
      status: 'confirmed',
      sourceLabel: 'gift',
      reason: 'Dry-run gifted copy',
      actorType: 'system',
      actorLabel: 'nurture-readiness',
      origin: 'dry_run',
      originRef: `gift-${suffix}`,
    },
  });
  const giftProfile = await prisma.readerProfile.findUnique({ where: { userId: giftUser.id } });
  const giftEvents = [
    {
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
      meta: { chapterId: '1', secondsOnPage: 95 },
      createdAt: new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
  ];
  const giftDecision = decideReaderNurture(decisionInput(giftUser, giftProfile, giftEvents, {
    now: due.recommendedTiming,
    evidence: [{ kind: 'gift_book_owner', status: 'confirmed', sourceLabel: 'gift' }],
  }));
  assert.strictEqual(giftDecision.classification.ownership, 'book_owner_gifted');
  assert.strictEqual(giftDecision.finalDecision, DECISION.SUPPRESSED);
  assert.strictEqual(giftDecision.reason, 'ownership_gifted');

  const buyer = await postLead({
    email: buyerEmail,
    captureSurface: 'cheer',
    promotionalOptIn: true,
  });
  assert.strictEqual(buyer.body.promotionalConsent, 'recorded');
  const buyerUser = await prisma.user.findUnique({ where: { email: buyerEmail } });
  const purchasedAt = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
  const buyerProfile = await prisma.readerProfile.findUnique({ where: { userId: buyerUser.id } });
  const buyerDecision = decideReaderNurture(decisionInput(buyerUser, buyerProfile, events, {
    now: due.recommendedTiming,
    purchases: [{ userId: buyerUser.id, saleStatus: 'live', purchasedAt: purchasedAt.toISOString() }],
    confirmedPurchaseAt: purchasedAt.toISOString(),
    ownReferralCode: 'ADA123',
  }));
  assert.strictEqual(buyerDecision.classification.ownership, 'purchaser');
  assert.strictEqual(buyerDecision.recommendedTreatment, TREATMENT.TEXT_A_FRIEND);
  assert.strictEqual(buyerDecision.finalDecision, DECISION.NOT_YET);
  assert.notStrictEqual(buyerDecision.category, 'prospect_nurture');

  const sent = [];
  const opened = await runPromotionalNurture(prisma, {
    now: due.recommendedTiming,
    siteUrl: SITE,
    postalAddress: POSTAL,
  }, {
    sendingEnabled: true,
    masterEnabled: true,
    checkTransactionalSuppression: async () => providerClear,
    send(payload) {
      sent.push(payload);
      return [{ status: 'sent', _id: 'dry-run-message' }];
    },
  });
  assert.strictEqual(opened.sent, 1, JSON.stringify(opened));
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, chapterEmail);
  assert.strictEqual(sent[0].subject, "You're starting to see the pieces...");
  assert.match(sent[0].html, /\/sample-chapters/);
  assert.match(sent[0].listUnsubscribeUrl, /\/api\/promotional-email\/unsubscribe\?token=/);
  assert.ok(!sent.some((row) => row.to === accessEmail || row.to === giftEmail || row.to === buyerEmail));

  const again = await runPromotionalNurture(prisma, {
    now: due.recommendedTiming,
    siteUrl: SITE,
    postalAddress: POSTAL,
  }, {
    sendingEnabled: true,
    masterEnabled: true,
    checkTransactionalSuppression: async () => providerClear,
    send() {
      throw new Error('duplicate promotional mail');
    },
  });
  assert.strictEqual(again.sent, 0);

  const preview = mockRes();
  await unsubscribeHandler({ method: 'GET', body: {}, query: { token: oneClickToken } }, preview, { prisma });
  assert.strictEqual(preview.body.promotionalEmail, 'unchanged');
  const removed = mockRes();
  await unsubscribeHandler({ method: 'POST', body: { token: oneClickToken }, query: {} }, removed, { prisma });
  assert.strictEqual(removed.statusCode, 200);
  assert.strictEqual(removed.body.promotionalEmail, 'off');
  const afterOptOut = await prisma.readerProfile.findUnique({ where: { userId: chapterUser.id } });
  const optedOut = decideReaderNurture(decisionInput(chapterUser, afterOptOut, events, { now: due.recommendedTiming }));
  assert.strictEqual(optedOut.finalDecision, DECISION.SUPPRESSED);
  assert.strictEqual(optedOut.reason, 'promotional_opt_out');

  const afterUnsubscribe = await runPromotionalNurture(prisma, {
    now: due.recommendedTiming,
    siteUrl: SITE,
    postalAddress: POSTAL,
  }, {
    sendingEnabled: true,
    masterEnabled: true,
    checkTransactionalSuppression: async () => providerClear,
    send() {
      throw new Error('unsubscribed reader was mailed');
    },
  });
  assert.strictEqual(afterUnsubscribe.sent, 0);
  assert.equal(masterPromotionalSendingEnabled(), false);
  assert.equal(nurturingSendEnabled(), false);

  console.log(JSON.stringify({
    pass: true,
    switches: { promotional: false, nurture: false },
    selectedForChapterReader: {
      treatment: due.recommendedTreatment,
      subject: message.subject,
      timing: due.recommendedTiming,
      decisionBeforeDue: tooSoon.finalDecision,
    },
    identifiedWithoutChapters: {
      treatment: identifiedDue.recommendedTreatment,
      subject: 'A little something from Jody',
      dueAfterDays: 3,
    },
    readingAccessOnly: accessDecision.reason,
    purchaser: { treatment: buyerDecision.recommendedTreatment, decision: buyerDecision.finalDecision },
    gifted: giftDecision.reason,
    sequence: rendered.concat([{ treatment: 'text_a_friend_day_28', subject: friend.subject, hasUnsubscribe: true }]),
    dryRunSent: opened.sent,
    duplicateSent: again.sent,
    afterUnsubscribeSent: afterUnsubscribe.sent,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
