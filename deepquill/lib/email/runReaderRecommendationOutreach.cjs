const mailchimp = require('@mailchimp/mailchimp_transactional');
const {
  normalizeEmail,
  isMailableEmail,
  isSyntheticReaderEmail,
} = require('../../src/lib/normalize.cjs');
const { guardMailableEmail } = require('./guardMailableEmail.cjs');
const { getMailchimpClient } = require('./sendEmail.cjs');
const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');
const {
  buildReaderRecommendationOutreachEmail,
} = require('./builders/readerRecommendationOutreach.cjs');
const { buildTextAFriendUrl } = require('../readers/readerUrls.cjs');
const { displayName } = require('../readers/readerUser.cjs');
const { validateAdminReaderEmail } = require('../readers/readerEmailValidation.cjs');
const { promotionalOutreachEligibility } = require('../readers/readerOutreachEligibility.cjs');
const {
  BATCH_2_LABEL,
  TEMPLATE_CURRENT,
  DEFAULT_BATCH_SIZE,
  normalizeBatchLabel,
  resolveTemplateId,
  parseDryRun,
  parseLimit,
  parseRequirePurchase,
  parseExcludePreviousBatches,
} = require('./readerRecommendationOutreachConfig.cjs');

const MAX_LIMIT = 100;
const SAMPLE_SIZE = 5;
const PER_EMAIL_DELAY_MS = Math.max(0, Number(process.env.ADMIN_EMAIL_PER_EMAIL_MS || 100));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptySkipped() {
  return {
    synthetic: 0,
    example: 0,
    placeholder: 0,
    fulfillmentStaff: 0,
    suppressed: 0,
    alreadySent: 0,
    notPurchased: 0,
    noCode: 0,
    inactive: 0,
    archived: 0,
    invalidEmail: 0,
    other: 0,
  };
}

async function fetchSuppressedSet() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    return { set: new Set(), fetched: false, reason: 'missing MAILCHIMP_TRANSACTIONAL_KEY' };
  }
  try {
    const client = mailchimp(apiKey);
    if (!client?.rejects?.list) {
      return { set: new Set(), fetched: false, reason: 'rejects.list unavailable' };
    }
    const rejects = await client.rejects.list({});
    const set = new Set(
      (Array.isArray(rejects) ? rejects : [])
        .map((r) => normalizeEmail(r?.email))
        .filter(Boolean),
    );
    return { set, fetched: true, reason: null };
  } catch (err) {
    return { set: new Set(), fetched: false, reason: err.message || 'rejects list failed' };
  }
}

async function loadPurchaserUserIds(prisma) {
  const purchases = await prisma.purchase.findMany({
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const ordered = [];
  const set = new Set();
  for (const row of purchases) {
    if (!row.userId || set.has(row.userId)) continue;
    set.add(row.userId);
    ordered.push(row.userId);
  }
  return { set, ordered };
}

function manualReasonForProfile(profile, user) {
  const mailable = isMailableEmail(user.email);
  if (mailable) return null;
  const normalized = normalizeEmail(user.email);
  if (!normalized) return 'invalid_email';
  if (isSyntheticReaderEmail(normalized)) return 'synthetic_email';
  return 'non_mailable_email';
}

function serializeManualOutreach(profile, user) {
  const referralCode = (user.referralCode || user.code || '').trim();
  return {
    name: displayName(user) || null,
    phone: (user.phone || '').trim() || null,
    referralCode: referralCode || null,
    smsConsentGranted: Boolean(profile.smsConsentGranted),
    source: profile.source || null,
    reasonManual: manualReasonForProfile(profile, user),
  };
}

function isPlaceholderEmail(email) {
  const check = validateAdminReaderEmail(email, { required: true });
  return !check.ok;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   dryRun?: boolean,
 *   limit?: number,
 *   batch?: string,
 *   template?: string,
 *   requirePurchase?: boolean,
 *   excludePreviousBatches?: boolean,
 *   transactionalEnabled?: boolean,
 * }} options
 */
async function runReaderRecommendationOutreach(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const limit = parseLimit(options.limit, DEFAULT_BATCH_SIZE);
  const batchLabel = normalizeBatchLabel(options.batch) || BATCH_2_LABEL;
  const templateId = resolveTemplateId(options.template, batchLabel);
  const requirePurchase = parseRequirePurchase(options.requirePurchase);
  const excludePreviousBatches =
    options.excludePreviousBatches !== undefined
      ? parseExcludePreviousBatches(options.excludePreviousBatches)
      : true;

  const skipped = emptySkipped();
  const errors = [];
  const manualOutreach = [];

  const purchaserData = requirePurchase ? await loadPurchaserUserIds(prisma) : null;
  const purchaserIds = purchaserData?.set ?? null;
  const purchaserOrder = purchaserData?.ordered ?? [];

  const profiles = await prisma.readerProfile.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          fname: true,
          lname: true,
          firstName: true,
          code: true,
          referralCode: true,
          readerRecommendationOutreachSentAt: true,
          readerRecommendationOutreachBatch: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const fulfillmentRows = await prisma.fulfillmentUser.findMany({ select: { email: true } });
  const fulfillmentStaff = new Set(
    fulfillmentRows.map((r) => normalizeEmail(r.email)).filter(Boolean),
  );

  const suppressed = await fetchSuppressedSet();

  const eligibleRecipients = [];

  for (const profile of profiles) {
    const user = profile.user;
    if (!user) {
      skipped.other += 1;
      continue;
    }

    if (requirePurchase && purchaserIds && !purchaserIds.has(user.id)) {
      skipped.notPurchased += 1;
      continue;
    }

    const manualReason = manualReasonForProfile(profile, user);
    if (manualReason) {
      manualOutreach.push(serializeManualOutreach(profile, user));
      continue;
    }

    const mailable = isMailableEmail(user.email);
    if (!mailable) {
      skipped.invalidEmail += 1;
      manualOutreach.push(serializeManualOutreach(profile, user));
      continue;
    }

    if (isPlaceholderEmail(mailable)) {
      skipped.placeholder += 1;
      continue;
    }

    if ((profile.status || 'active') === 'archived') {
      skipped.archived += 1;
      continue;
    }
    if ((profile.status || 'active') !== 'active') {
      skipped.inactive += 1;
      continue;
    }

    const eligibility = await promotionalOutreachEligibility(prisma, {
      userId: user.id,
      email: user.email,
    });
    if (!eligibility.eligible || eligibility.lookup !== 'ok') {
      if (eligibility.reason === 'archived') skipped.archived += 1;
      else skipped.suppressed += 1;
      continue;
    }

    const normalized = normalizeEmail(user.email);
    if (isSyntheticReaderEmail(normalized)) {
      skipped.synthetic += 1;
      continue;
    }
    if (normalized.endsWith('@example.com')) {
      skipped.example += 1;
      continue;
    }
    if (fulfillmentStaff.has(normalized)) {
      skipped.fulfillmentStaff += 1;
      continue;
    }
    if (suppressed.set.has(normalized)) {
      skipped.suppressed += 1;
      continue;
    }
    if (excludePreviousBatches && user.readerRecommendationOutreachSentAt) {
      skipped.alreadySent += 1;
      continue;
    }

    const readerCode = (user.referralCode || user.code || '').trim();
    if (!readerCode) {
      skipped.noCode += 1;
      continue;
    }

    eligibleRecipients.push({
      userId: user.id,
      email: mailable,
      firstName: user.firstName || user.fname || null,
      readerCode,
      profileId: profile.id,
      priorBatch: user.readerRecommendationOutreachBatch || null,
    });
  }

  if (requirePurchase && purchaserOrder.length > 0) {
    const rank = new Map(purchaserOrder.map((id, index) => [id, index]));
    eligibleRecipients.sort(
      (a, b) => (rank.get(a.userId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.userId) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const targets = eligibleRecipients.slice(0, limit);
  const recipientSample = targets.slice(0, SAMPLE_SIZE).map((r) => ({
    email: r.email,
    firstName: r.firstName,
    readerCode: r.readerCode,
    textAFriendUrl: buildTextAFriendUrl(r.readerCode, r.email),
    priorBatch: r.priorBatch,
  }));

  const manualOutreachSample = manualOutreach.slice(0, SAMPLE_SIZE);

  const campaignMeta = {
    campaign: 'reader_recommendation_outreach',
    batch: batchLabel,
    template: templateId,
  };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      batch: batchLabel,
      template: templateId,
      requirePurchase,
      excludePreviousBatches,
      limit,
      eligible: eligibleRecipients.length,
      sent: 0,
      wouldSend: targets.length,
      skipped,
      manualOutreachCount: manualOutreach.length,
      manualOutreachSample,
      recipientSample,
      suppressedListFetched: suppressed.fetched,
      errors,
      campaign: campaignMeta,
    };
  }

  const transactionalEnabled =
    options.transactionalEnabled !== undefined
      ? options.transactionalEnabled
      : process.env.TRANSACTIONAL_EMAIL_ENABLED === '1';

  if (!transactionalEnabled) {
    return {
      ok: true,
      dryRun: false,
      transactionalDisabled: true,
      reason: 'TRANSACTIONAL_EMAIL_ENABLED not set',
      batch: batchLabel,
      template: templateId,
      requirePurchase,
      excludePreviousBatches,
      limit,
      eligible: eligibleRecipients.length,
      sent: 0,
      skipped,
      manualOutreachCount: manualOutreach.length,
      manualOutreachSample,
      recipientSample,
      campaign: campaignMeta,
    };
  }

  const client = getMailchimpClient();
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!client || !fromEmail) {
    return {
      ok: false,
      dryRun: false,
      batch: batchLabel,
      template: templateId,
      limit,
      eligible: eligibleRecipients.length,
      sent: 0,
      skipped,
      manualOutreachCount: manualOutreach.length,
      manualOutreachSample,
      recipientSample,
      errors: ['Email service not configured (MAILCHIMP_TRANSACTIONAL_KEY or MAILCHIMP_FROM_EMAIL missing)'],
      campaign: campaignMeta,
    };
  }

  let sent = 0;
  const sentRecipients = [];

  for (const recipient of targets) {
    try {
      const guarded = guardMailableEmail(recipient.email, 'reader_recommendation_outreach');
      if (!guarded) {
        skipped.invalidEmail += 1;
        continue;
      }

      const textAFriendUrl = buildTextAFriendUrl(recipient.readerCode, guarded);
      const { subject, html, text } = buildReaderRecommendationOutreachEmail({
        firstName: recipient.firstName,
        textAFriendUrl,
        template: templateId,
      });
      const { html: htmlWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });

      await client.messages.send({
        message: {
          from_email: fromEmail,
          from_name: 'Kris Jugler',
          subject: finalSubject ?? subject,
          to: [{ email: guarded, type: 'to' }],
          html: htmlWithBanner,
          text,
          headers: { 'Reply-To': fromEmail },
          metadata: campaignMeta,
          tags: ['reader_recommendation_outreach', templateId],
        },
      });

      const sentAt = new Date();
      await prisma.user.update({
        where: { id: recipient.userId },
        data: {
          readerRecommendationOutreachSentAt: sentAt,
          readerRecommendationOutreachBatch: batchLabel,
        },
      });

      sentRecipients.push({
        email: guarded,
        firstName: recipient.firstName,
        readerCode: recipient.readerCode,
        sentAt: sentAt.toISOString(),
      });

      sent += 1;
      if (PER_EMAIL_DELAY_MS > 0) {
        await sleep(PER_EMAIL_DELAY_MS);
      }
    } catch (err) {
      errors.push(`Failed to send to ${recipient.email}: ${err?.message || 'Unknown error'}`);
    }
  }

  return {
    ok: true,
    dryRun: false,
    batch: batchLabel,
    template: templateId,
    requirePurchase,
    excludePreviousBatches,
    limit,
    eligible: eligibleRecipients.length,
    sent,
    sentRecipients,
    skipped,
    manualOutreachCount: manualOutreach.length,
    manualOutreachSample,
    recipientSample,
    suppressedListFetched: suppressed.fetched,
    errors,
    campaign: campaignMeta,
  };
}

module.exports = {
  runReaderRecommendationOutreach,
  parseDryRun,
  parseLimit,
  parseRequirePurchase,
  parseExcludePreviousBatches,
  normalizeBatchLabel,
  resolveTemplateId,
  DEFAULT_BATCH_SIZE,
  MAX_LIMIT,
};
