/**
 * Shared send path for older system-initiated promotional jobs.
 * Claims the existing sent-at column before the provider call.
 * A definite provider rejection releases the claim. An ambiguous failure keeps it.
 */

const { lookupPromotionalConsent } = require('./lookupPromotionalConsent.cjs');
const { promotionalRecipientBlock } = require('./promotionalRecipientPolicy.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { checkTransactionalSuppression } = require('../email/transactionalSuppression.cjs');
const {
  buildPromotionalUnsubscribeUrl,
  buildPromotionalOneClickUnsubscribeUrl,
} = require('./promotionalUnsubscribeToken.cjs');
const {
  appendPromotionalIdentification,
  promotionalListHeaders,
} = require('../email/promotionalCompliance.cjs');
const { classifyProviderFailure, classifyProviderResult } = require('../email/providerSendOutcome.cjs');

async function claimUserField(prisma, userId, field) {
  const data = {};
  data[field] = new Date();
  const where = { id: userId };
  where[field] = null;
  const result = await prisma.user.updateMany({ where, data });
  return result.count === 1;
}

async function releaseUserField(prisma, userId, field) {
  const data = {};
  data[field] = null;
  await prisma.user.update({ where: { id: userId }, data });
}

async function deliverLegacyPromotional(prisma, input, deps = {}) {
  const block = promotionalRecipientBlock(input.email);
  if (block) return { sent: false, failed: false, reason: block };
  const consent = await lookupPromotionalConsent(prisma, { userId: input.user.id, email: input.email });
  if (!consent.allowed) return { sent: false, failed: false, reason: consent.reason };
  const check = deps.checkTransactionalSuppression || checkTransactionalSuppression;
  let suppression;
  try {
    suppression = await check(input.email);
  } catch {
    suppression = { checked: false, suppressed: true };
  }
  if (!suppression || suppression.checked !== true || suppression.suppressed === true) {
    return { sent: false, failed: false, reason: 'provider_suppression' };
  }
  const claimed = await claimUserField(prisma, input.user.id, input.sentAtField);
  if (!claimed) return { sent: false, failed: false, reason: 'already_claimed' };
  let visible = null;
  let oneClick = null;
  try {
    visible = buildPromotionalUnsubscribeUrl({ userId: input.user.id, email: input.email });
    oneClick = buildPromotionalOneClickUnsubscribeUrl({ userId: input.user.id, email: input.email });
  } catch {
    await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: false, reason: 'unsubscribe_unavailable' };
  }
  const identified = appendPromotionalIdentification({
    html: input.html,
    text: input.text,
    postalAddress: input.postalAddress,
    unsubscribeUrl: visible,
  });
  if (!identified) {
    await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: false, reason: 'postal_address_required' };
  }
  let current;
  try {
    current = await prisma.user.findUnique({
      where: { id: input.user.id },
      select: { id: true, email: true },
    });
  } catch {
    await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: false, reason: 'lookup_failed' };
  }
  const currentEmail = current && normalizeEmail(current.email);
  if (!currentEmail || currentEmail !== normalizeEmail(input.email)) {
    await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: false, reason: 'identity_changed' };
  }
  const again = await lookupPromotionalConsent(prisma, { userId: input.user.id, email: current.email });
  if (!again.allowed) {
    await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: false, reason: again.reason };
  }
  let suppressionAgain;
  try {
    suppressionAgain = await check(current.email);
  } catch {
    suppressionAgain = { checked: false, suppressed: true };
  }
  if (!suppressionAgain || suppressionAgain.checked !== true || suppressionAgain.suppressed === true) {
    await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: false, reason: 'provider_suppression' };
  }
  try {
    const result = await input.client.messages.send({
      message: {
        from_email: input.fromEmail,
        from_name: input.fromName || 'The Agnes Protocol',
        subject: input.subject,
        to: [{ email: current.email, type: 'to' }],
        html: identified.html,
        text: identified.text,
        headers: {
          'Reply-To': input.fromEmail,
          ...promotionalListHeaders(oneClick),
        },
      },
    });
    const kind = classifyProviderResult(result);
    if (kind === 'accepted') return { sent: true, failed: false, reason: 'accepted' };
    if (kind === 'rejected') {
      await releaseUserField(prisma, input.user.id, input.sentAtField);
      return { sent: false, failed: true, reason: 'provider_rejected' };
    }
    return { sent: false, failed: true, reason: 'delivery_unknown' };
  } catch (err) {
    const kind = classifyProviderFailure(err);
    if (kind === 'rejected') await releaseUserField(prisma, input.user.id, input.sentAtField);
    return { sent: false, failed: true, reason: kind === 'rejected' ? 'provider_rejected' : 'delivery_unknown' };
  }
}

module.exports = {
  deliverLegacyPromotional,
  claimUserField,
  releaseUserField,
};
