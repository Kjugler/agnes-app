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
        const buyUrl = `${BASE_URL}/sample-chapters`;
        const challengeUrl = `${BASE_URL}/contest`;
        const shareUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const journalUrl = `${BASE_URL}/journal`;
        const { subject, html } = buildEngagedReminderEmail({ firstName: user.firstName, buyUrl, challengeUrl, shareUrl, journalUrl });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: user.email, type: 'to' }],
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
        const referUrl = user.referralCode ? `${BASE_URL}/refer?code=${user.referralCode}` : `${BASE_URL}/refer`;
        const { subject, html } = buildNonParticipantReminderEmail({
          firstName: user.firstName,
          challengeUrl: `${BASE_URL}/contest`,
          buyUrl: `${BASE_URL}/sample-chapters`,
          sampleUrl: `${BASE_URL}/sample-chapters`,
          shareUrl: referUrl,
        });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: user.email, type: 'to' }],
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
      },
      select: { id: true, email: true, firstName: true, referralCode: true },
      take: MAX_EMAILS_PER_RUN,
    });

    const BASE_URL = getSiteUrl();
    let sentCount = 0;
    const errors = [];

    for (const user of users) {
      try {
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
            to: [{ email: user.email, type: 'to' }],
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
        const referUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const shareUrl = referUrl;
        const { subject, html } = buildMissionaryEmail({
          firstName: user.firstName,
          referUrl,
          shareUrl,
          reviewUrl: `${BASE_URL}/journal`,
          challengeUrl: `${BASE_URL}/contest`,
          journalUrl: `${BASE_URL}/journal`,
        });
        const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject: finalSubject ?? subject,
            to: [{ email: user.email, type: 'to' }],
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

module.exports = router;
