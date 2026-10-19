/**
 * Consent-gated nurturing pass.
 * With NURTURE_PROMOTIONAL_SENDING unset, this examines nothing and sends nothing.
 */

const { nurturingSendEnabled } = require('./nurtureActivation.cjs');
const { authorizeRecommendedPromotionalNurture } = require('./authorizePromotionalNurture.cjs');
const { buildNurtureMessage } = require('../email/builders/nurtureMessage.cjs');
const { sendEmail } = require('../email/sendEmail.cjs');

const SOURCE = 'promotional_nurture';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function emptyResult(extra = {}) {
  return {
    ok: true,
    enabled: false,
    sent: 0,
    skipped: 0,
    failed: 0,
    examined: 0,
    reason: 'nurture_sending_disabled',
    ...extra,
  };
}

function dayKey(timing) {
  const raw = timing ? String(timing) : new Date().toISOString();
  return raw.slice(0, 10);
}

async function claimSend(prisma, { userId, email, treatment, category, timing }) {
  const sourceRef = `nurture:${userId}:${treatment}:${dayKey(timing)}`;
  try {
    await prisma.readerCommunication.create({
      data: {
        userId,
        recipientEmailSnapshot: email,
        category: category || 'promotional_nurture',
        templateOrAskId: treatment,
        trigger: 'automatic_job',
        jobName: 'promotional-nurture',
        occurredAt: new Date(),
        outcome: 'unknown',
        source: SOURCE,
        sourceRef,
      },
    });
    return { claimed: true, sourceRef };
  } catch (err) {
    if (err && err.code === 'P2002') return { claimed: false, sourceRef, duplicate: true };
    throw err;
  }
}

async function deliver(deps, message, email) {
  const send = deps.send || sendEmail;
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!deps.send && !fromEmail) throw new Error('MAILCHIMP_FROM_EMAIL missing');
  return send({
    fromEmail,
    fromName: 'Jody',
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

async function runPromotionalNurture(prisma, options = {}, deps = {}) {
  const enabled = deps.sendingEnabled != null
    ? deps.sendingEnabled === true
    : nurturingSendEnabled();
  if (!enabled) return emptyResult();

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

  for (const profile of profiles) {
    const userId = profile && profile.userId;
    if (!userId) {
      skipped += 1;
      continue;
    }
    const auth = await authorize(prisma, { userId, now: options.now }, deps);
    if (!auth || auth.authorized !== true || auth.treatment === 'none') {
      skipped += 1;
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user || !user.email) {
      skipped += 1;
      continue;
    }
    const message = buildNurtureMessage({
      treatment: auth.treatment,
      unsubscribeUrl: auth.unsubscribeUrl,
      siteUrl: options.siteUrl,
      textAFriendUrl: options.textAFriendUrl,
    });
    if (!message) {
      skipped += 1;
      continue;
    }
    if (!deps.send && !process.env.MAILCHIMP_FROM_EMAIL) {
      failed += 1;
      continue;
    }
    const claim = await claimSend(prisma, {
      userId,
      email: user.email,
      treatment: auth.treatment,
      category: auth.category,
      timing: auth.timing,
    });
    if (!claim.claimed) {
      skipped += 1;
      continue;
    }
    try {
      const result = await deliver(deps, message, user.email);
      const row = Array.isArray(result) ? result[0] : null;
      if (typeof prisma.readerCommunication.update === 'function') {
        try {
          await prisma.readerCommunication.update({
            where: { source_sourceRef: { source: SOURCE, sourceRef: claim.sourceRef } },
            data: {
              outcome: 'accepted',
              providerMessageId: row && row._id ? String(row._id) : null,
            },
          });
        } catch {
          // The claim already prevents a second send.
        }
      }
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    ok: true,
    enabled: true,
    sent,
    skipped,
    failed,
    examined: profiles.length,
    reason: null,
  };
}

module.exports = {
  runPromotionalNurture,
};
