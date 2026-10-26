/**
 * Read-only eligible-recipient count.
 * Examines the database in DATABASE_URL. Does not send mail and does not
 * change reader records. Refuses the local deepquill/dev.db.
 *
 * Usage, from the linked Railway project directory:
 *   railway run -- node <this-file>
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { authorizeRecommendedPromotionalNurture } = require('../lib/readers/authorizePromotionalNurture.cjs');
const { normalizeEmail } = require('../src/lib/normalize.cjs');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');

function refuseDatabase(url) {
  const raw = String(url || '');
  if (!raw) throw new Error('DATABASE_URL is required');
  const normalized = raw.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('deepquill/dev.db')) {
    throw new Error('Refusing to read the local deepquill/dev.db');
  }
  if (/file:\.?\/?dev\.db(\?|$)/.test(normalized)) {
    throw new Error('Refusing to read the local deepquill/dev.db');
  }
  try {
    const withoutFile = raw.replace(/^file:/i, '').replace(/\?.*$/, '');
    if (path.resolve(DEEPQUILL_ROOT, withoutFile) === path.resolve(DEV_DB)) {
      throw new Error('Refusing to read the local deepquill/dev.db');
    }
  } catch (err) {
    if (err && err.message && err.message.startsWith('Refusing')) throw err;
  }
}

function bump(map, key) {
  const name = key || 'none';
  map[name] = (map[name] || 0) + 1;
}

function presence(name) {
  return Boolean(String(process.env[name] || '').trim());
}

async function fingerprint(prisma) {
  const [communications, profiles, users, consenting, optedOut, profileStamp] = await Promise.all([
    prisma.readerCommunication.count(),
    prisma.readerProfile.count(),
    prisma.user.count(),
    prisma.readerProfile.count({ where: { emailMarketingConsentAt: { not: null } } }),
    prisma.readerProfile.count({ where: { emailMarketingOptOutAt: { not: null } } }),
    prisma.readerProfile.aggregate({ _max: { updatedAt: true } }),
  ]);
  return {
    communications,
    profiles,
    users,
    consenting,
    optedOut,
    profileUpdatedAt: profileStamp._max.updatedAt ? profileStamp._max.updatedAt.toISOString() : null,
  };
}

async function loadRejects() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) return { ok: false, reason: 'missing_key' };
  let client;
  try {
    const mailchimp = require('@mailchimp/mailchimp_transactional');
    client = mailchimp(apiKey);
  } catch {
    return { ok: false, reason: 'client_unavailable' };
  }
  if (!client || typeof client.rejects?.list !== 'function') {
    return { ok: false, reason: 'rejects_list_unavailable' };
  }
  try {
    const rejects = await client.rejects.list({});
    if (!Array.isArray(rejects)) return { ok: false, reason: 'rejects_list_invalid' };
    const byEmail = new Map();
    for (const item of rejects) {
      const email = normalizeEmail(item && item.email);
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, String(item && item.reason || 'provider_reject'));
    }
    return { ok: true, listed: byEmail.size, byEmail };
  } catch {
    return { ok: false, reason: 'rejects_list_failed' };
  }
}

function providerCheck(rejects) {
  return async function checkTransactionalSuppression(email) {
    if (!rejects.ok) {
      return { checked: false, suppressed: true, reason: 'provider_check_failed', providerReason: rejects.reason };
    }
    const normalized = normalizeEmail(email);
    const providerReason = normalized ? rejects.byEmail.get(normalized) : null;
    if (!providerReason) {
      return { checked: true, suppressed: false, reason: null, providerReason: null };
    }
    const value = providerReason.toLowerCase();
    let reason = 'provider_reject';
    if (value === 'spam' || value === 'complaint') reason = 'complaint';
    else if (value === 'unsub' || value === 'unsubscribe') reason = 'provider_unsubscribe';
    else if (value === 'hard-bounce' || value === 'hard_bounce') reason = 'hard_bounce';
    return { checked: true, suppressed: true, reason, providerReason };
  };
}

async function examine(prisma, check) {
  const profiles = await prisma.readerProfile.findMany({
    where: { emailMarketingConsentAt: { not: null } },
    select: { userId: true },
    orderBy: { emailMarketingConsentAt: 'asc' },
  });
  const byDecision = {};
  const byTreatment = {};
  const byReason = {};
  const byDecisionTreatmentReason = {};
  const dueImmediatelyByTreatment = {};
  const notYetByTreatment = {};
  let dueImmediately = 0;
  let examined = 0;
  let loadFailed = 0;

  for (const profile of profiles) {
    if (!profile || !profile.userId) continue;
    examined += 1;
    const result = await authorizeRecommendedPromotionalNurture(
      prisma,
      { userId: profile.userId },
      { checkTransactionalSuppression: check },
    );
    const decision = result && result.decision ? result.decision : 'unknown';
    const treatment = result && result.treatment ? result.treatment : 'none';
    const reason = result && result.reason ? result.reason : 'unknown';
    bump(byDecision, decision);
    bump(byTreatment, treatment);
    bump(byReason, reason);
    bump(byDecisionTreatmentReason, `${decision} | ${treatment} | ${reason}`);
    if (result && result.authorized === true) {
      dueImmediately += 1;
      bump(dueImmediatelyByTreatment, treatment);
    } else if (reason === 'scheduled_time_not_reached') {
      bump(notYetByTreatment, treatment);
    } else if (reason === 'reader_load_failed') {
      loadFailed += 1;
    }
  }

  return {
    examined,
    dueImmediately,
    dueImmediatelyByTreatment,
    notYetByTreatment,
    byDecision,
    byTreatment,
    byReason,
    byDecisionTreatmentReason,
    loadFailed,
  };
}

async function main() {
  if (process.env.NURTURE_DRY_RUN_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.NURTURE_DRY_RUN_DATABASE_URL;
  }
  refuseDatabase(process.env.DATABASE_URL);
  const configuration = {
    PROMOTIONAL_SENDING_ENABLED: presence('PROMOTIONAL_SENDING_ENABLED'),
    NURTURE_PROMOTIONAL_SENDING: presence('NURTURE_PROMOTIONAL_SENDING'),
    PROMOTIONAL_POSTAL_ADDRESS: presence('PROMOTIONAL_POSTAL_ADDRESS'),
    PROMOTIONAL_REPLY_TO: presence('PROMOTIONAL_REPLY_TO'),
  };
  delete process.env.PROMOTIONAL_SENDING_ENABLED;
  delete process.env.NURTURE_PROMOTIONAL_SENDING;

  const prisma = new PrismaClient();
  const before = await fingerprint(prisma);
  const rejects = await loadRejects();
  const fileDatabase = /^(file|sqlite):/i.test(String(process.env.DATABASE_URL || ''));
  let population;
  let readOnlyTransaction = true;
  if (fileDatabase) {
    await prisma.$executeRawUnsafe('PRAGMA query_only = ON');
    try {
      population = await examine(prisma, providerCheck(rejects));
    } finally {
      await prisma.$executeRawUnsafe('PRAGMA query_only = OFF');
    }
  } else {
    try {
      population = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return examine(tx, providerCheck(rejects));
      }, { timeout: 600000, maxWait: 20000 });
    } catch (err) {
      const message = String(err && err.message || '');
      if (!/read only|SET TRANSACTION|25006/i.test(message)) throw err;
      readOnlyTransaction = false;
      population = await examine(prisma, providerCheck(rejects));
    }
  }
  const after = await fingerprint(prisma);
  await prisma.$disconnect();

  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!unchanged) {
    throw new Error('Reader records changed during the dry run');
  }
  if (population.loadFailed === population.examined && population.examined > 0) {
    throw new Error('Every consenting reader failed to load');
  }

  const report = {
    ok: true,
    sent: 0,
    recordsChanged: false,
    readOnlyTransaction,
    configurationPresent: configuration,
    providerRejectCheck: rejects.ok ? 'checked' : rejects.reason,
    providerRejectListSize: rejects.ok ? rejects.listed : null,
    readerProfiles: before.profiles,
    consentingReaders: before.consenting,
    notSelectedNoPromotionalConsent: before.profiles - before.consenting,
    optedOutProfiles: before.optedOut,
    ...population,
  };
  delete report.loadFailed;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  const message = String(err && err.message || 'dry_run_failed');
  console.error(JSON.stringify({ ok: false, error: message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]') }));
  process.exit(1);
});
