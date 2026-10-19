/**
 * Live promotional sends must have explicit consent.
 * Reading-access email and a purchase do not count.
 */

const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { promotionalConsentState } = require('./promotionalConsent.cjs');

async function findReader(prisma, { userId, email }) {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (id) {
    return prisma.user.findUnique({
      where: { id },
      include: { readerProfile: true },
    });
  }
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return prisma.user.findUnique({
    where: { email: normalized },
    include: { readerProfile: true },
  });
}

async function lookupPromotionalConsent(prisma, { userId, email } = {}) {
  if (!prisma) return { allowed: false, reason: 'lookup_failed' };
  let user;
  try {
    user = await findReader(prisma, { userId, email });
  } catch {
    return { allowed: false, reason: 'lookup_failed' };
  }
  if (!user || !user.readerProfile) {
    return { allowed: false, reason: 'no_promotional_consent' };
  }
  if (user.readerProfile.status === 'archived') {
    return { allowed: false, reason: 'archived' };
  }
  const state = promotionalConsentState(user.readerProfile);
  if (state.optOutAt && !state.active) {
    return { allowed: false, reason: 'promotional_opt_out' };
  }
  if (!state.active) {
    return { allowed: false, reason: 'no_promotional_consent' };
  }
  return { allowed: true, reason: 'explicit_consent' };
}

module.exports = {
  lookupPromotionalConsent,
};
