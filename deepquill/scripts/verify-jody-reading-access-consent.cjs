/**
 * Two-opportunity promotional consent. No database, network, or email.
 * Usage: node scripts/verify-jody-reading-access-consent.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planJodyReadingAccessOptIn } = require('../lib/readers/jodyReadingAccessOptIn.cjs');
const { applyPromotionalPreference, promotionalConsentState } = require('../lib/readers/promotionalConsent.cjs');
const { planDepartureOptIn, departureStatus } = require('../lib/readers/departureOptIn.cjs');

const NOW = new Date('2026-10-19T16:00:00.000Z');
const LATER = new Date('2026-10-20T16:00:00.000Z');

function memoryPrisma(initial) {
  const state = { profile: initial ? { ...initial } : null };
  return {
    state,
    readerProfile: {
      async findUnique() {
        return state.profile;
      },
      async create({ data }) {
        state.profile = { id: 'p1', ...data };
        return state.profile;
      },
      async update({ data }) {
        const allowed = [
          'emailMarketingConsentAt',
          'emailMarketingConsentSource',
          'emailMarketingOptOutAt',
          'emailMarketingOptOutSource',
        ];
        for (const key of Object.keys(data)) assert.ok(allowed.includes(key), key);
        state.profile = { ...state.profile, ...data };
        return state.profile;
      },
    },
  };
}

async function main() {
  const unchecked = planJodyReadingAccessOptIn({ explicit: true, accept: false });
  assert.equal(unchecked.write, false);
  assert.equal(unchecked.error, 'explicit_confirmation_required');

  const fresh = planJodyReadingAccessOptIn({ explicit: true, accept: true, profile: null });
  assert.equal(fresh.write, true);
  assert.equal(fresh.source, 'jody-reading-access');

  const prisma = memoryPrisma(null);
  const saved = await applyPromotionalPreference(prisma, {
    userId: 'reader-1',
    action: fresh.action,
    source: fresh.source,
    explicit: true,
    now: NOW,
  });
  assert.equal(saved.changed, true);
  assert.equal(saved.state.active, true);
  assert.equal(saved.state.consentSource, 'jody-reading-access');
  assert.equal(saved.state.consentAt, NOW.toISOString());
  assert.equal(departureStatus({ known: true, profile: prisma.state.profile }).decided, true);
  assert.equal(
    planDepartureOptIn({ explicit: true, accept: true, profile: prisma.state.profile }).error,
    'already_decided',
  );

  const duplicate = planJodyReadingAccessOptIn({
    explicit: true,
    accept: true,
    profile: prisma.state.profile,
  });
  assert.equal(duplicate.write, false);
  assert.equal(duplicate.error, 'already_active');

  const optedOut = memoryPrisma({
    emailMarketingConsentAt: NOW,
    emailMarketingConsentSource: 'reader_preferences',
    emailMarketingOptOutAt: LATER,
    emailMarketingOptOutSource: 'unsubscribe_link',
  });
  const preserved = planJodyReadingAccessOptIn({
    explicit: true,
    accept: true,
    profile: optedOut.state.profile,
  });
  assert.equal(preserved.write, false);
  assert.equal(preserved.error, 'opt_out_preserved');
  const revived = await applyPromotionalPreference(optedOut, {
    userId: 'reader-1',
    action: 'opt_in',
    source: 'jody-reading-access',
    explicit: true,
    now: new Date('2026-10-21T16:00:00.000Z'),
  });
  assert.equal(revived.ok, false);
  assert.equal(revived.error, 'opt_out_preserved');
  assert.equal(promotionalConsentState(optedOut.state.profile).active, false);
  assert.equal(promotionalConsentState(optedOut.state.profile).optOutAt, LATER.toISOString());
  assert.equal(
    departureStatus({ known: true, profile: optedOut.state.profile }).decided,
    true,
  );

  assert.equal(
    planJodyReadingAccessOptIn({ explicit: true, accept: true, doNotContact: true }).error,
    'suppressed',
  );
  assert.equal(
    planJodyReadingAccessOptIn({ explicit: true, accept: true, archived: true }).error,
    'suppressed',
  );

  const root = path.join(__dirname, '..');
  const lead = fs.readFileSync(path.join(root, 'api/readersAgree/lead.cjs'), 'utf8');
  const client = fs.readFileSync(
    path.join(root, '../agnes-next/src/lib/readersAgreeLead.ts'),
    'utf8',
  );
  const invitation = fs.readFileSync(
    path.join(root, '../agnes-next/src/components/sample-chapters/JodyReaderInvitation.tsx'),
    'utf8',
  );
  const bridge = fs.readFileSync(
    path.join(root, '../agnes-next/src/components/departure/DepartureBridge.tsx'),
    'utf8',
  );
  const footer = fs.readFileSync(path.join(root, '../agnes-next/src/components/SiteFooter.tsx'), 'utf8');
  const reader = fs.readFileSync(
    path.join(root, '../agnes-next/src/components/sample-chapters/SampleChapterReader.tsx'),
    'utf8',
  );

  const planner = fs.readFileSync(path.join(root, 'lib/readers/jodyReadingAccessOptIn.cjs'), 'utf8');
  assert.match(lead, /promotionalOptIn === true/);
  assert.match(lead, /planJodyReadingAccessOptIn/);
  assert.match(planner, /jody-reading-access/);
  assert.doesNotMatch(planner, /messages\.send|sendEmail/);
  assert.doesNotMatch(lead, /messages\.send|sendEmail|NURTURE_PROMOTIONAL_SENDING/);
  assert.match(client, /if \(input\.promotionalOptIn === true\) payload\.promotionalOptIn = true/);
  assert.doesNotMatch(client, /consentAccepted/);
  assert.match(invitation, /useState\(false\)/);
  assert.match(invitation, /markJodyAccessSettled/);
  assert.match(invitation, /onAccessEstablished/);
  assert.doesNotMatch(bridge, /beforeunload|preventDefault\(\)/);
  assert.match(footer, /Email preferences/);
  assert.match(reader, /markSampleReadingEngaged/);
  assert.doesNotMatch(reader, /DepartureBridge/);

  console.log('verify-jody-reading-access-consent: passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
