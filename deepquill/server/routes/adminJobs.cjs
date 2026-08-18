// deepquill/server/routes/adminJobs.cjs
// Admin jobs: email reminders, seed-signal-room (canonical DB)

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
const { getMailchimpClient } = require('../../lib/email/sendEmail.cjs');
const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');
const { buildEngagedReminderEmail } = require('../../lib/email/builders/engagedReminder.cjs');
const { buildNoPurchaseReminderEmail } = require('../../lib/email/builders/noPurchaseReminder.cjs');
const { buildNonParticipantReminderEmail } = require('../../lib/email/builders/nonParticipantReminder.cjs');
const { buildMissionaryEmail } = require('../../lib/email/builders/missionaryEmail.cjs');
const { buildProspectNurtureEmail } = require('../../lib/email/builders/prospectNurture.cjs');
const { guardMailableEmail } = require('../../lib/email/guardMailableEmail.cjs');
const { userHasPurchase } = require('../../lib/readers/readerStatus.cjs');
const { READERS_AGREE_V2_SOURCE, buildSampleChaptersUrlFromAttribution } = require('../../lib/readers/readersAgreeLead.cjs');
const { recordServerFunnelEvent } = require('../../lib/funnel/recordServerFunnelEvent.cjs');
const { FUNNEL_EVENT_TYPES } = require('../../lib/funnel/funnelEventTypes.cjs');

const router = express.Router();

const MAX_EMAILS_PER_RUN = 100;
const CUTOFF_2_DAYS = 2 * 24 * 60 * 60 * 1000;
const CUTOFF_24_HOURS = 24 * 60 * 60 * 1000;
const READ_DELAY_15_DAYS = 15 * 24 * 60 * 60 * 1000;

function getSiteUrl() {
  return process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002';
}

function shouldSendTransactionalEmails() {
  return process.env.TRANSACTIONAL_EMAIL_ENABLED === '1';
}

function isAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

// All job routes require admin auth
router.use((req, res, next) => {
  if (!isAdminAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden - x-admin-key required in production' });
  }
  next();
});

// GET /api/admin/jobs/send-engaged-reminders
router.get('/send-engaged-reminders', async (req, res) => {
  try {
    if (!shouldSendTransactionalEmails()) {
      return res.json({ ok: true, skipped: true, reason: 'TRANSACTIONAL_EMAIL_ENABLED not set', sentCount: 0 });
    }
    const client = getMailchimpClient();
    if (!client) return res.status(500).json({ ok: false, error: 'Email service not configured' });
    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
    if (!fromEmail) return res.status(500).json({ ok: false, error: 'MAILCHIMP_FROM_EMAIL not configured' });

    const cutoff = new Date(Date.now() - CUTOFF_2_DAYS);
    const conversions = await prisma.referralConversion.findMany({ select: { buyerEmail: true } });
    const buyerEmails = Array.from(new Set(conversions.map((c) => c.buyerEmail).filter(Boolean)));

    const users = await prisma.user.findMany({
      where: {
        engagedEmailSentAt: null,
        createdAt: { lte: cutoff },
        OR: [
          { contestJoinedAt: { not: null } },
          { posts: { some: {} } },
          { events: { some: {} } },
        ],
        purchases: { none: {} },
        ...(buyerEmails.length > 0 ? { email: { notIn: buyerEmails } } : {}),
      },
      select: { id: true, email: true, firstName: true, referralCode: true },
      take: MAX_EMAILS_PER_RUN,
    });

    const BASE_URL = getSiteUrl();
    let sentCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        if (!user.referralCode) { console.warn(`[engaged-reminder] Skipping ${user.email}: no referralCode`); continue; }
        const mailable = guardMailableEmail(user.email, 'engaged_reminder');
        if (!mailable) { console.warn(`[engaged-reminder] Skipping non-mailable ${user.email}`); continue; }
        const buyUrl = `${BASE_URL}/sample-chapters`;
        const challengeUrl = `${BASE_URL}/sample-chapters`;
        const shareUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const journalUrl = `${BASE_URL}/journal`;
        const { subject, html } = buildEngagedReminderEmail({ firstName: user.firstName, buyUrl, challengeUrl, shareUrl, journalUrl });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: mailable, type: 'to' }],
            html: htmlWithBanner,
            headers: { 'Reply-To': fromEmail },
          },
        });
        await prisma.user.update({ where: { id: user.id }, data: { engagedEmailSentAt: new Date() } });
        sentCount++;
      } catch (err) {
        errors.push(`Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`);
      }
    }
    res.json({ ok: true, sent: sentCount, total: users.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[engaged-reminder] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/admin/jobs/send-non-participant-reminders
router.get('/send-non-participant-reminders', async (req, res) => {
  try {
    if (!shouldSendTransactionalEmails()) {
      return res.json({ ok: true, skipped: true, reason: 'TRANSACTIONAL_EMAIL_ENABLED not set', sentCount: 0 });
    }
    const client = getMailchimpClient();
    if (!client) return res.status(500).json({ ok: false, error: 'Email service not configured' });
    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
    if (!fromEmail) return res.status(500).json({ ok: false, error: 'MAILCHIMP_FROM_EMAIL not configured' });

    const cutoff = new Date(Date.now() - CUTOFF_2_DAYS);
    const conversions = await prisma.referralConversion.findMany({ select: { buyerEmail: true } });
    const buyerEmails = Array.from(new Set(conversions.map((c) => c.buyerEmail).filter(Boolean)));

    const candidates = await prisma.user.findMany({
      where: {
        nonParticipantEmailSentAt: null,
        contestJoinedAt: { not: null },
        createdAt: { lte: cutoff },
        purchases: { none: {} },
        posts: { none: {} },
        ...(buyerEmails.length > 0 ? { email: { notIn: buyerEmails } } : {}),
      },
      select: { id: true, email: true, firstName: true, referralCode: true },
      take: MAX_EMAILS_PER_RUN * 2,
    });

    const users = [];
    for (const u of candidates) {
      const rollup = await getPointsRollupForUser(prisma, u.id);
      if ((rollup?.totalPoints || 0) === 0) users.push(u);
      if (users.length >= MAX_EMAILS_PER_RUN) break;
    }

    const BASE_URL = getSiteUrl();
    let sentCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        const mailable = guardMailableEmail(user.email, 'non_participant_reminder');
        if (!mailable) continue;
        const referUrl = user.referralCode ? `${BASE_URL}/refer?code=${user.referralCode}` : `${BASE_URL}/refer`;
        const { subject, html } = buildNonParticipantReminderEmail({
          firstName: user.firstName,
          challengeUrl: `${BASE_URL}/sample-chapters`,
          buyUrl: `${BASE_URL}/sample-chapters`,
          sampleUrl: `${BASE_URL}/sample-chapters`,
          shareUrl: referUrl,
        });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: mailable, type: 'to' }],
            html: htmlWithBanner,
            headers: { 'Reply-To': fromEmail },
          },
        });
        await prisma.user.update({ where: { id: user.id }, data: { nonParticipantEmailSentAt: new Date() } });
        sentCount++;
      } catch (err) {
        errors.push(`Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`);
      }
    }
    res.json({ ok: true, sent: sentCount, total: users.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[non-participant-reminder] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/admin/jobs/send-no-purchase-reminders
router.get('/send-no-purchase-reminders', async (req, res) => {
  try {
    if (!shouldSendTransactionalEmails()) {
      return res.json({ ok: true, skipped: true, reason: 'TRANSACTIONAL_EMAIL_ENABLED not set', sentCount: 0 });
    }
    const client = getMailchimpClient();
    if (!client) return res.status(500).json({ ok: false, error: 'Email service not configured' });
    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
    if (!fromEmail) return res.status(500).json({ ok: false, error: 'MAILCHIMP_FROM_EMAIL not configured' });

    const twentyFourHoursAgo = new Date(Date.now() - CUTOFF_24_HOURS);
    const users = await prisma.user.findMany({
      where: {
        noPurchaseEmailSentAt: null,
        createdAt: { lte: twentyFourHoursAgo },
        purchases: { none: {} },
        NOT: {
          readerProfile: {
            is: {
              OR: [
                { source: READERS_AGREE_V2_SOURCE },
                { prospectNurtureEnrolledAt: { not: null } },
              ],
            },
          },
        },
      },
      select: { id: true, email: true, firstName: true, referralCode: true },
      take: MAX_EMAILS_PER_RUN,
    });

    const BASE_URL = getSiteUrl();
    let sentCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        const mailable = guardMailableEmail(user.email, 'no_purchase_reminder');
        if (!mailable) continue;
        const shareUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const { subject, html } = buildNoPurchaseReminderEmail({
          firstName: user.firstName,
          buyUrl: `${BASE_URL}/sample-chapters`,
          referUrl: `${BASE_URL}/refer`,
          shareUrl,
          journalUrl: `${BASE_URL}/journal`,
        });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: mailable, type: 'to' }],
            html: htmlWithBanner,
            headers: { 'Reply-To': fromEmail },
          },
        });
        await prisma.user.update({ where: { id: user.id }, data: { noPurchaseEmailSentAt: new Date() } });
        sentCount++;
      } catch (err) {
        errors.push(`Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`);
      }
    }
    res.json({ ok: true, sent: sentCount, total: users.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[no-purchase-reminder] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/admin/jobs/send-missionary-emails
router.get('/send-missionary-emails', async (req, res) => {
  try {
    if (!shouldSendTransactionalEmails()) {
      return res.json({ ok: true, skipped: true, reason: 'TRANSACTIONAL_EMAIL_ENABLED not set', sentCount: 0 });
    }
    const client = getMailchimpClient();
    if (!client) return res.status(500).json({ ok: false, error: 'Email service not configured' });
    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
    if (!fromEmail) return res.status(500).json({ ok: false, error: 'MAILCHIMP_FROM_EMAIL not configured' });

    const cutoff = new Date(Date.now() - READ_DELAY_15_DAYS);
    const usersFromPurchases = await prisma.user.findMany({
      where: {
        missionaryEmailSentAt: null,
        purchases: { some: { createdAt: { lte: cutoff } } },
      },
      select: { id: true, email: true, firstName: true, referralCode: true },
    });

    const conversions = await prisma.referralConversion.findMany({
      where: { createdAt: { lte: cutoff } },
      select: { buyerEmail: true },
    });
    const buyerEmails = Array.from(new Set(conversions.map((c) => c.buyerEmail).filter(Boolean)));
    const usersFromConversions = buyerEmails.length
      ? await prisma.user.findMany({
          where: { missionaryEmailSentAt: null, email: { in: buyerEmails } },
          select: { id: true, email: true, firstName: true, referralCode: true },
        })
      : [];

    const userMap = new Map();
    for (const u of usersFromPurchases) userMap.set(u.id, u);
    for (const u of usersFromConversions) if (!userMap.has(u.id)) userMap.set(u.id, u);
    const users = Array.from(userMap.values()).slice(0, MAX_EMAILS_PER_RUN);

    const BASE_URL = getSiteUrl();
    let sentCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        const mailable = guardMailableEmail(user.email, 'missionary_email');
        if (!mailable) continue;
        const referUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const shareUrl = referUrl;
        const { subject, html } = buildMissionaryEmail({
          firstName: user.firstName,
          referUrl,
          shareUrl,
          reviewUrl: `${BASE_URL}/journal`,
          challengeUrl: `${BASE_URL}/sample-chapters`,
          journalUrl: `${BASE_URL}/journal`,
        });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: mailable, type: 'to' }],
            html: htmlWithBanner,
            headers: { 'Reply-To': fromEmail },
          },
        });
        await prisma.user.update({ where: { id: user.id }, data: { missionaryEmailSentAt: new Date() } });
        sentCount++;
      } catch (err) {
        errors.push(`Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`);
      }
    }
    res.json({ ok: true, sent: sentCount, total: users.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[missionary-email] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/admin/jobs/seed-signal-room
const SYSTEM_SIGNALS = [
  { text: 'Protocol Challenge is live. New signals are being monitored.', isSystem: true, status: 'APPROVED' },
  { text: 'A new reader entered through Terminal 2.', isSystem: true, status: 'APPROVED' },
  { text: 'Someone shared The Protocol. A referral code is propagating.', isSystem: true, status: 'APPROVED' },
  { text: 'Signal Room is online. Speak carefully. Signal carries.', isSystem: true, status: 'APPROVED' },
  { text: "Remember: describe your experience - don't quote the book.", isSystem: true, status: 'APPROVED' },
];

router.get('/seed-signal-room', async (req, res) => {
  try {
    let created = 0;
    let updated = 0;

    for (const signalData of SYSTEM_SIGNALS) {
      const existing = await prisma.signal.findFirst({
        where: { text: signalData.text, isSystem: true },
      });

      if (existing) {
        if (existing.status !== signalData.status) {
          await prisma.signal.update({
            where: { id: existing.id },
            data: {
              status: signalData.status,
              approvedAt: signalData.status === 'APPROVED' ? new Date() : null,
            },
          });
          updated++;
        }
      } else {
        await prisma.signal.create({
          data: {
            text: signalData.text,
            isSystem: signalData.isSystem,
            status: signalData.status,
            approvedAt: signalData.status === 'APPROVED' ? new Date() : null,
            countryCode: null,
            region: null,
          },
        });
        created++;
      }
    }

    const total = await prisma.signal.count({ where: { isSystem: true } });
    res.json({ ok: true, created, updated, total });
  } catch (err) {
    console.error('[seed-signal-room] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// POST/GET /api/admin/jobs/daily-contest-summary — nightly job (x-admin-key). Optional ?date=YYYY-MM-DD or JSON body.summaryDate
async function runDailyContestSummaryJob(req, res) {
  const {
    runDailyContestSummary,
    toPublicSummaryDto,
    recordDailyContestSummaryJobRun,
    getDailyContestSummaryJobStatus,
  } = require('../../lib/dailyContestSummary.cjs');
  try {
    const date =
      (typeof req.query?.date === 'string' && req.query.date.trim()) ||
      (req.body && typeof req.body.summaryDate === 'string' && req.body.summaryDate.trim()) ||
      undefined;
    const result = await runDailyContestSummary(prisma, { summaryDate: date });
    await recordDailyContestSummaryJobRun(prisma, { success: true });
    return res.json({
      ok: true,
      summaryDate: result.summaryDate,
      summary: toPublicSummaryDto(result.summary),
      placement: result.placement,
      contestantCount: result.contestantCount,
      jobStatus: await getDailyContestSummaryJobStatus(prisma),
    });
  } catch (err) {
    console.error('[daily-contest-summary job]', err);
    try {
      await recordDailyContestSummaryJobRun(prisma, {
        success: false,
        errorMessage: err?.message || 'Unknown error',
      });
    } catch (e2) {
      console.error('[daily-contest-summary job] job-status', e2);
    }
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}

router.post('/daily-contest-summary', express.json(), runDailyContestSummaryJob);
router.get('/daily-contest-summary', runDailyContestSummaryJob);

// GET/POST /api/admin/jobs/backfill-reader-profiles?dryRun=1&includeArchivedBeta=0
async function runBackfillReaderProfilesJob(req, res) {
  const { runBackfillReaderProfiles } = require('../../lib/readers/runBackfillReaderProfiles.cjs');
  try {
    const dryRunParam = req.query?.dryRun ?? req.body?.dryRun;
    const dryRun = dryRunParam === undefined || dryRunParam === '1' || dryRunParam === 'true' || dryRunParam === true;
    const includeParam = req.query?.includeArchivedBeta ?? req.body?.includeArchivedBeta;
    const includeArchivedBeta = includeParam === '1' || includeParam === 'true' || includeParam === true;

    const summary = await runBackfillReaderProfiles({
      prisma,
      dryRun,
      includeArchivedBeta,
    });

    console.log('[admin/backfill-reader-profiles]', JSON.stringify(summary));

    return res.json({ ok: true, operation: 'backfill_reader_profiles', ...summary });
  } catch (err) {
    console.error('[admin/backfill-reader-profiles]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}

router.get('/backfill-reader-profiles', runBackfillReaderProfilesJob);
router.post('/backfill-reader-profiles', express.json(), runBackfillReaderProfilesJob);

// GET/POST /api/admin/jobs/send-reader-recommendation-outreach?dryRun=1&limit=25
async function runReaderRecommendationOutreachJob(req, res) {
  const {
    runReaderRecommendationOutreach,
    parseDryRun,
    parseLimit,
    parseRequirePurchase,
    parseExcludePreviousBatches,
    normalizeBatchLabel,
    resolveTemplateId,
  } = require('../../lib/email/runReaderRecommendationOutreach.cjs');
  const {
    BATCH_2_LABEL,
    TEMPLATE_CURRENT,
  } = require('../../lib/email/readerRecommendationOutreachConfig.cjs');
  try {
    const dryRunParam = req.query?.dryRun ?? req.body?.dryRun;
    const dryRun = parseDryRun(dryRunParam);
    const limitParam = req.query?.limit ?? req.body?.limit;
    const limit = parseLimit(limitParam);
    const batchParam = req.query?.batch ?? req.body?.batch;
    const templateParam = req.query?.template ?? req.body?.template;
    const requirePurchaseParam = req.query?.requirePurchase ?? req.body?.requirePurchase;
    const excludeParam =
      req.query?.excludePreviousBatches ?? req.body?.excludePreviousBatches;

    const batch = normalizeBatchLabel(batchParam) || BATCH_2_LABEL;
    const template = resolveTemplateId(templateParam ?? TEMPLATE_CURRENT, batch);
    const requirePurchase = parseRequirePurchase(requirePurchaseParam ?? '1');
    const excludePreviousBatches = parseExcludePreviousBatches(excludeParam);

    const result = await runReaderRecommendationOutreach(prisma, {
      dryRun,
      limit,
      batch,
      template,
      requirePurchase,
      excludePreviousBatches,
    });

    console.log('[admin/send-reader-recommendation-outreach]', JSON.stringify({
      dryRun: result.dryRun,
      batch: result.batch,
      template: result.template,
      requirePurchase: result.requirePurchase,
      eligible: result.eligible,
      sent: result.sent,
      wouldSend: result.wouldSend,
      manualOutreachCount: result.manualOutreachCount,
    }));

    return res.json(result);
  } catch (err) {
    console.error('[admin/send-reader-recommendation-outreach]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}

router.get('/send-reader-recommendation-outreach', runReaderRecommendationOutreachJob);
router.post('/send-reader-recommendation-outreach', express.json(), runReaderRecommendationOutreachJob);

// Elapsed-time thresholds from prospectNurtureEnrolledAt (not calendar days).
const PROSPECT_NURTURE_STEP_1_MIN_HOURS = 48;
const PROSPECT_NURTURE_DAY_THRESHOLDS = Object.freeze({ 2: 5, 3: 10, 4: 14 });

function prospectNurtureStepEligible(enrolledAt, nextStep) {
  const elapsedMs = Date.now() - enrolledAt.getTime();
  if (nextStep === 1) {
    return elapsedMs >= PROSPECT_NURTURE_STEP_1_MIN_HOURS * 60 * 60 * 1000;
  }
  const dayThreshold = PROSPECT_NURTURE_DAY_THRESHOLDS[nextStep];
  if (dayThreshold == null) return false;
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  return elapsedDays >= dayThreshold;
}

// GET /api/admin/jobs/send-prospect-nurture — steps 1–4 (step 0 at lead capture)
router.get('/send-prospect-nurture', async (req, res) => {
  try {
    if (!shouldSendTransactionalEmails()) {
      return res.json({ ok: true, skipped: true, reason: 'TRANSACTIONAL_EMAIL_ENABLED not set', sent: 0 });
    }
    const client = getMailchimpClient();
    if (!client) return res.status(500).json({ ok: false, error: 'Email service not configured' });
    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
    if (!fromEmail) return res.status(500).json({ ok: false, error: 'MAILCHIMP_FROM_EMAIL not configured' });

    const profiles = await prisma.readerProfile.findMany({
      where: {
        source: READERS_AGREE_V2_SOURCE,
        prospectNurtureEnrolledAt: { not: null },
        prospectNurtureSuppressedAt: null,
        OR: [
          { prospectNurtureLastSentAt: { not: null } },
          { prospectNurtureLastSentAt: null, prospectNurtureStep: null },
          { prospectNurtureLastSentAt: null, prospectNurtureStep: 0 },
        ],
      },
      include: { user: { select: { id: true, email: true } } },
      take: MAX_EMAILS_PER_RUN,
    });

    let sent = 0;
    const errors = [];

    for (const profile of profiles) {
      try {
        const userId = profile.userId;
        const email = profile.user?.email;
        if (!email) continue;

        if (await userHasPurchase(prisma, userId)) {
          await prisma.readerProfile.update({
            where: { id: profile.id },
            data: {
              prospectNurtureSuppressedAt: new Date(),
              prospectNurtureSuppressedReason: 'purchased',
            },
          });
          continue;
        }

        const enrolledAt = profile.prospectNurtureEnrolledAt;
        if (!enrolledAt) continue;

        // Retry Email 0 when welcome send failed at lead capture (lastSentAt still null).
        const nextStep =
          profile.prospectNurtureLastSentAt == null ? 0 : (profile.prospectNurtureStep ?? 0) + 1;
        if (nextStep > 4) continue;
        if (nextStep > 0 && !prospectNurtureStepEligible(enrolledAt, nextStep)) continue;

        const mailable = guardMailableEmail(email, 'prospect_nurture');
        if (!mailable) continue;

        const attribution =
          profile.leadAttribution && typeof profile.leadAttribution === 'object'
            ? profile.leadAttribution
            : {};
        const sampleChaptersUrl = buildSampleChaptersUrlFromAttribution(attribution);
        const { subject, html } = buildProspectNurtureEmail({ step: nextStep, sampleChaptersUrl });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({
          html,
          subject,
        });

        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: mailable, type: 'to' }],
            html: htmlWithBanner,
            headers: { 'Reply-To': fromEmail },
          },
        });

        await prisma.readerProfile.update({
          where: { id: profile.id },
          data: {
            prospectNurtureStep: nextStep,
            prospectNurtureLastSentAt: new Date(),
          },
        });

        await recordServerFunnelEvent(prisma, {
          type: FUNNEL_EVENT_TYPES.PROSPECT_NURTURE_SENT,
          userId,
          meta: { step: nextStep, channel: attribution.channel || null },
        });

        sent++;
      } catch (err) {
        errors.push(`profile ${profile.id}: ${err?.message || 'Unknown error'}`);
      }
    }

    res.json({ ok: true, sent, total: profiles.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[prospect-nurture] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

module.exports = router;
