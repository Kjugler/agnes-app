/**
 * Consent-gated nurturing pass.
 * With either promotional switch unset, this examines nothing and sends nothing.
 *
 * A claim is one lifetime row per reader and category. The final authorization
 * runs again immediately before the provider call and does not create a second
 * claim. A crash that leaves the claim reserved or sending is not retried.
 * A timeout after the provider request is marked ambiguous and is not retried.
 * The interval between that last read and provider acceptance cannot be made
 * atomic with an external mail service.
 */

const { nurturingSendEnabled } = require('./nurtureActivation.cjs');
const { masterPromotionalSendingEnabled, promotionalPostalAddress, promotionalReplyTo } = require('./promotionalActivation.cjs');
const { authorizeRecommendedPromotionalNurture } = require('./authorizePromotionalNurture.cjs');
const { buildNurtureMessage } = require('../email/builders/nurtureMessage.cjs');
const { buildTextAFriendUrl } = require('./readerUrls.cjs');
const { buildPromotionalOneClickUnsubscribeUrl } = require('./promotionalUnsubscribeToken.cjs');
const { sendEmail } = require('../email/sendEmail.cjs');
const { classifyProviderFailure, classifyProviderResult } = require('../email/providerSendOutcome.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');

const SOURCE = 'promotional_nurture';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const RETRYABLE_OUTCOMES = ['suppressed_before_send', 'provider_rejected'];
const JODY_MESSAGE_CATEGORIES = new Set([
  'prospect_nurture',
  'reader_recommendation_taf',
  'review_invitation',
]);
const PRIOR_JODY_OUTCOMES = new Set([
  'accepted',
  'recorded_sent_delivery_unknown',
  'unknown',
  'sending',
  'delivery_unknown',
]);

async function hasPriorJodyMessage(prisma, userId) {
  const table = prisma && prisma.readerCommunication;
  if (!table || typeof table.findMany !== 'function') return false;
  let rows = [];
  try {
    rows = await table.findMany({
      where: {
        userId,
        category: { in: [...JODY_MESSAGE_CATEGORIES] },
        outcome: { in: [...PRIOR_JODY_OUTCOMES] },
      },
      select: { userId: true, category: true, outcome: true },
    });
  } catch {
    return false;
  }
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => {
    if (!row || !JODY_MESSAGE_CATEGORIES.has(row.category) || !PRIOR_JODY_OUTCOMES.has(row.outcome)) {
      return false;
    }
    return !row.userId || row.userId === userId;
  });
}

function emptyResult(extra = {}) {
  return {
    ok: true,
    enabled: false,
    sent: 0,
    skipped: 0,
    failed: 0,
    suppressed: 0,
    examined: 0,
    reason: 'nurture_sending_disabled',
    ...extra,
  };
}

function lifetimeRef(userId, category) {
  return `nurture:${userId}:${category}`;
}

function gatesOpen(deps, env) {
  const nurture = deps.sendingEnabled != null
    ? deps.sendingEnabled === true
    : nurturingSendEnabled(env);
  const master = deps.masterEnabled != null
    ? deps.masterEnabled === true
    : masterPromotionalSendingEnabled(env);
  if (!master) return { open: false, reason: 'promotional_sending_disabled' };
  if (!nurture) return { open: false, reason: 'nurture_sending_disabled' };
  return { open: true, reason: null };
}

async function obtainClaim(prisma, { userId, email, treatment, category }) {
  const sourceRef = lifetimeRef(userId, category);
  const data = {
    userId,
    recipientEmailSnapshot: email,
    category: category || 'promotional_nurture',
    templateOrAskId: treatment,
    trigger: 'automatic_job',
    jobName: 'promotional-nurture',
    occurredAt: new Date(),
    outcome: 'reserved',
    source: SOURCE,
    sourceRef,
  };
  try {
    await prisma.readerCommunication.create({ data });
    return { owned: true, sourceRef };
  } catch (err) {
    if (!err || err.code !== 'P2002') throw err;
  }
  if (typeof prisma.readerCommunication.updateMany !== 'function') {
    return { owned: false, sourceRef };
  }
  const taken = await prisma.readerCommunication.updateMany({
    where: { source: SOURCE, sourceRef, outcome: { in: RETRYABLE_OUTCOMES } },
    data: {
      outcome: 'reserved',
      templateOrAskId: treatment,
      recipientEmailSnapshot: email,
      occurredAt: new Date(),
    },
  });
  return { owned: taken.count === 1, sourceRef };
}

async function setOutcome(prisma, sourceRef, outcome, extra = {}) {
  const data = { outcome, ...extra };
  if (typeof prisma.readerCommunication.updateMany === 'function') {
    const updated = await prisma.readerCommunication.updateMany({
      where: { source: SOURCE, sourceRef, outcome: outcome === 'sending' ? 'reserved' : undefined },
      data,
    });
    if (outcome === 'sending') return updated.count === 1;
  }
  if (typeof prisma.readerCommunication.update === 'function') {
    await prisma.readerCommunication.update({
      where: { source_sourceRef: { source: SOURCE, sourceRef } },
      data,
    });
    return true;
  }
  return false;
}

async function mark(prisma, sourceRef, outcome, extra) {
  try {
    if (outcome === 'sending') return setOutcome(prisma, sourceRef, outcome, extra);
    if (typeof prisma.readerCommunication.update === 'function') {
      await prisma.readerCommunication.update({
        where: { source_sourceRef: { source: SOURCE, sourceRef } },
        data: { outcome, ...extra },
      });
      return true;
    }
    return setOutcome(prisma, sourceRef, outcome, extra);
  } catch {
    return false;
  }
}

async function deliver(deps, message, email, oneClickUrl, replyTo) {
  const send = deps.send || sendEmail;
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!deps.send && !fromEmail) {
    const err = new Error('MAILCHIMP_FROM_EMAIL missing');
    err.statusCode = 400;
    throw err;
  }
  return send({
    fromEmail,
    fromName: 'Jody',
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    listUnsubscribeUrl: oneClickUrl,
    ...(replyTo ? { replyTo } : {}),
  });
}

async function runPromotionalNurture(prisma, options = {}, deps = {}) {
  const gates = gatesOpen(deps, process.env);
  if (!gates.open) return emptyResult({ reason: gates.reason });
  const postalAddress = String(
    options.postalAddress != null ? options.postalAddress : (promotionalPostalAddress() || ''),
  ).trim();
  if (!postalAddress) {
    return emptyResult({ enabled: true, reason: 'postal_address_required' });
  }
  const replyTo = String(
    options.replyTo != null ? options.replyTo : (promotionalReplyTo() || ''),
  ).trim();
  if (!deps.send && !replyTo) {
    return emptyResult({ enabled: true, reason: 'reply_to_required' });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(options.limit) || DEFAULT_LIMIT),
  );
  const profiles = await prisma.readerProfile.findMany({
    where: { emailMarketingConsentAt: { not: null } },
    select: { userId: true },
    orderBy: { emailMarketingConsentAt: 'asc' },
    take: limit,
  });

  const authorize = deps.authorize || authorizeRecommendedPromotionalNurture;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let suppressed = 0;

  for (const profile of profiles) {
    const userId = profile && profile.userId;
    if (!userId) {
      skipped += 1;
      continue;
    }
    const auth = await authorize(prisma, { userId, now: options.now }, deps);
    if (!auth || auth.authorized !== true || auth.treatment === 'none' || !auth.category) {
      if (auth && auth.decision === 'SUPPRESSED') suppressed += 1;
      skipped += 1;
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, referralCode: true },
    });
    if (!user || !user.email) {
      skipped += 1;
      continue;
    }
    const personalCode = String(user.referralCode || '').trim();
    const textAFriendUrl = auth.treatment === 'text_a_friend_day_28'
      ? (personalCode ? buildTextAFriendUrl(personalCode) : null)
      : options.textAFriendUrl;
    const priorJodyMessage = await hasPriorJodyMessage(prisma, userId);
    const draft = buildNurtureMessage({
      treatment: auth.treatment,
      unsubscribeUrl: auth.unsubscribeUrl,
      siteUrl: options.siteUrl,
      textAFriendUrl,
      postalAddress,
      priorJodyMessage,
    });
    if (!draft) {
      suppressed += 1;
      skipped += 1;
      continue;
    }
    const claim = await obtainClaim(prisma, {
      userId,
      email: user.email,
      treatment: auth.treatment,
      category: auth.category,
    });
    if (!claim.owned) {
      suppressed += 1;
      skipped += 1;
      continue;
    }
    const again = await authorize(prisma, { userId, now: options.now }, deps);
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, referralCode: true },
    });
    const samePerson = current
      && normalizeEmail(current.email) === normalizeEmail(user.email);
    if (!again || again.authorized !== true || again.treatment !== auth.treatment || !samePerson) {
      await mark(prisma, claim.sourceRef, 'suppressed_before_send', {
        caption: !samePerson ? 'identity_changed' : (again && again.reason) || 'not_authorized',
      });
      suppressed += 1;
      skipped += 1;
      continue;
    }
    const currentCode = String(current.referralCode || '').trim();
    const currentFriendUrl = again.treatment === 'text_a_friend_day_28'
      ? (currentCode ? buildTextAFriendUrl(currentCode) : null)
      : textAFriendUrl;
    let oneClickUrl = null;
    try {
      oneClickUrl = buildPromotionalOneClickUnsubscribeUrl({
        userId: current.id,
        email: current.email,
        siteUrl: options.siteUrl,
      });
    } catch {
      oneClickUrl = null;
    }
    const message = buildNurtureMessage({
      treatment: again.treatment,
      unsubscribeUrl: again.unsubscribeUrl,
      siteUrl: options.siteUrl,
      textAFriendUrl: currentFriendUrl,
      postalAddress,
      priorJodyMessage,
    });
    if (!message || !oneClickUrl) {
      await mark(prisma, claim.sourceRef, 'suppressed_before_send');
      suppressed += 1;
      skipped += 1;
      continue;
    }
    const locked = await mark(prisma, claim.sourceRef, 'sending');
    if (!locked) {
      skipped += 1;
      continue;
    }
    try {
      const result = await deliver(deps, message, current.email, oneClickUrl, replyTo);
      const kind = deps.send && (result == null || result === true)
        ? 'accepted'
        : classifyProviderResult(result);
      if (kind === 'accepted') {
        const row = Array.isArray(result) ? result[0] : null;
        await mark(prisma, claim.sourceRef, 'accepted', {
          providerMessageId: row && row._id ? String(row._id) : null,
        });
        sent += 1;
      } else if (kind === 'rejected') {
        await mark(prisma, claim.sourceRef, 'provider_rejected');
        failed += 1;
      } else {
        await mark(prisma, claim.sourceRef, 'delivery_unknown');
        failed += 1;
      }
    } catch (err) {
      const kind = classifyProviderFailure(err);
      await mark(prisma, claim.sourceRef, kind === 'rejected' ? 'provider_rejected' : 'delivery_unknown');
      failed += 1;
    }
  }

  return {
    ok: true,
    enabled: true,
    sent,
    skipped,
    failed,
    suppressed,
    examined: profiles.length,
    reason: null,
  };
}

module.exports = {
  runPromotionalNurture,
};
