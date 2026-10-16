/**
 * Departure opt-in rules. No database, network, or email.
 * Usage: node scripts/verify-departure-opt-in.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planDepartureOptIn, departureStatus } = require('../lib/readers/departureOptIn.cjs');

const profile = {
  emailMarketingConsentAt: '2026-10-01T16:00:00.000Z',
  emailMarketingOptOutAt: null,
};

assert.equal(planDepartureOptIn({ explicit: false, accept: true }).error, 'explicit_confirmation_required');
assert.equal(planDepartureOptIn({ explicit: true, accept: false }).write, false);

const fresh = planDepartureOptIn({ explicit: true, accept: true, profile: null });
assert.equal(fresh.write, true);
assert.equal(fresh.source, 'departure_bridge');

assert.equal(
  planDepartureOptIn({ explicit: true, accept: true, profile }).error,
  'already_decided',
);
assert.equal(
  planDepartureOptIn({
    explicit: true,
    accept: true,
    profile: { emailMarketingConsentAt: '2026-10-01T16:00:00.000Z', emailMarketingOptOutAt: '2026-10-02T16:00:00.000Z' },
  }).error,
  'already_decided',
);
assert.equal(planDepartureOptIn({ explicit: true, accept: true, doNotContact: true }).error, 'suppressed');
assert.equal(planDepartureOptIn({ explicit: true, accept: true, archived: true }).error, 'suppressed');

assert.deepEqual(departureStatus({ known: false }), { audience: 'unknown', decided: false, emailHint: null });
assert.equal(departureStatus({ known: true, profile: null }).decided, false);
assert.equal(departureStatus({ known: true, profile, doNotContact: false, archived: false }).decided, true);

const root = path.join(__dirname, '..');
const handler = fs.readFileSync(path.join(root, 'api/promotionalEmail/departure.cjs'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'lib/readers/departureOptIn.cjs'), 'utf8');
const reader = fs.readFileSync(path.join(root, '../agnes-next/src/components/sample-chapters/SampleChapterReader.tsx'), 'utf8');
const jody = fs.readFileSync(path.join(root, '../agnes-next/src/components/jody/JodyConcierge.tsx'), 'utf8');
assert.doesNotMatch(handler, /referredBy|lastReferralCode|preferredDiscountCode|readingAllowance|emailUpdatesConsent/);
assert.match(handler, /explicit === true/);
assert.match(plan, /departure_bridge/);
assert.doesNotMatch(reader, /DepartureBridge/);
assert.doesNotMatch(jody, /DepartureBridge/);

console.log('verify-departure-opt-in: passed');
