/**
 * Explicit promotional-email permission.
 * Reading access, purchases, and audience membership do not write these fields.
 * A revisit or a background sync cannot clear an opt-out.
 */

const SOURCES = new Set(['reader_preferences', 'unsubscribe_link', 'departure_bridge']);
const CONSENT_FIELDS = [
  'emailMarketingConsentAt',
  'emailMarketingConsentSource',
  'emailMarketingOptOutAt',
  'emailMarketingOptOutSource',
];

function isoFrom(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function promotionalConsentState(profile) {
  const consentAt = isoFrom(profile && profile.emailMarketingConsentAt);
  const optOutAt = isoFrom(profile && profile.emailMarketingOptOutAt);
  const active = Boolean(consentAt) && (!optOutAt || consentAt > optOutAt);
  return {
    active,
    consentAt,
    consentSource: (profile && profile.emailMarketingConsentSource) || null,
    optOutAt,
    optOutSource: (profile && profile.emailMarketingOptOutSource) || null,
  };
}

function planPromotionalPreference(profile, { action, source, explicit, now } = {}) {
  if (explicit !== true) {
    return { write: false, error: 'explicit_confirmation_required' };
  }
  if (action !== 'opt_in' && action !== 'opt_out') {
    return { write: false, error: 'unsupported_action' };
  }
  if (!SOURCES.has(source)) {
    return { write: false, error: 'unsupported_source' };
  }

  const current = promotionalConsentState(profile);
  const at = now instanceof Date ? now : new Date();
  if (action === 'opt_in') {
    if (current.active) return { write: false, state: current };
    return {
      write: true,
      data: {
        emailMarketingConsentAt: at,
        emailMarketingConsentSource: source,
      },
    };
  }
  if (!current.active && current.optOutAt) return { write: false, state: current };
  return {
    write: true,
    data: {
      emailMarketingOptOutAt: at,
      emailMarketingOptOutSource: source,
    },
  };
}

function assertConsentWrite(data) {
  const keys = Object.keys(data || {});
  if (keys.some((key) => !CONSENT_FIELDS.includes(key))) {
    throw new Error('promotional consent write left its allowed fields');
  }
}

async function ensureProfile(prisma, userId) {
  const existing = await prisma.readerProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.readerProfile.create({
    data: {
      userId,
      status: 'active',
    },
  });
}

async function applyPromotionalPreference(prisma, { userId, action, source, explicit, now } = {}) {
  if (!userId) return { ok: false, error: 'missing_reader' };
  const plan = planPromotionalPreference(null, { action, source, explicit, now });
  if (plan.error) return { ok: false, error: plan.error };

  const profile = await ensureProfile(prisma, userId);
  const planned = planPromotionalPreference(profile, { action, source, explicit, now });
  if (planned.error) return { ok: false, error: planned.error };
  if (!planned.write) {
    return { ok: true, changed: false, state: promotionalConsentState(profile) };
  }
  assertConsentWrite(planned.data);
  const updated = await prisma.readerProfile.update({
    where: { userId },
    data: planned.data,
  });
  return { ok: true, changed: true, state: promotionalConsentState(updated) };
}

module.exports = {
  SOURCES,
  CONSENT_FIELDS,
  promotionalConsentState,
  planPromotionalPreference,
  applyPromotionalPreference,
};
