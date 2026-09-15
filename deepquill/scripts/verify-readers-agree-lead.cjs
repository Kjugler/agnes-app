// Minimal checks for /api/readers-agree/lead helpers (no DB writes).

const assert = require('assert');
const { buildRedirectPath, resolveCaptureSurface, resolveRetailerOrigin } = require('../api/readersAgree/lead.cjs');
const {
  READERS_AGREE_V2_SOURCE,
  PROSPECT_TYPE,
  createLabelsForNewProfile,
  buildLeadAttributionSnapshot,
} = require('../lib/readers/readersAgreeLead.cjs');
const { OWNERSHIP } = require('../lib/readers/classifyReader.cjs');
const fs = require('fs');
const path = require('path');

assert.strictEqual(buildRedirectPath({}), '/sample-chapters');
assert.strictEqual(
  buildRedirectPath({ ref: 'abc123', utm: { utm_source: 'meta' } }),
  '/sample-chapters?ref=abc123&utm_source=meta',
);
assert.strictEqual(
  buildRedirectPath({ code: 'xyz', utm: { fbclid: '1' } }),
  '/sample-chapters?code=xyz&fbclid=1',
);
assert.strictEqual(resolveCaptureSurface(undefined), 'landing');
assert.strictEqual(resolveCaptureSurface('landing'), 'landing');
assert.strictEqual(resolveCaptureSurface('other'), 'landing');
assert.strictEqual(resolveCaptureSurface('bridge'), 'bridge');
assert.strictEqual(resolveRetailerOrigin(undefined), null);
assert.strictEqual(resolveRetailerOrigin('landing'), null);
assert.strictEqual(resolveRetailerOrigin('amazon'), 'amazon');
assert.strictEqual(resolveRetailerOrigin('bn'), 'bn');

assert.deepStrictEqual(
  createLabelsForNewProfile({ classification: { ownership: OWNERSHIP.NON_PURCHASER, sources: [] } }),
  { source: READERS_AGREE_V2_SOURCE, readerType: PROSPECT_TYPE, status: 'active' },
);
assert.deepStrictEqual(
  createLabelsForNewProfile({
    classification: { ownership: OWNERSHIP.PURCHASER, sources: ['website'] },
  }),
  { source: 'Website', readerType: 'purchased', status: 'active' },
);
assert.deepStrictEqual(
  createLabelsForNewProfile({
    classification: { ownership: OWNERSHIP.BOOK_OWNER_GIFTED, sources: [] },
  }),
  { source: 'Gift', readerType: 'gifted', status: 'active' },
);
assert.deepStrictEqual(
  createLabelsForNewProfile({
    classification: { ownership: OWNERSHIP.UNKNOWN, sources: [] },
  }),
  { source: null, readerType: 'interested', status: 'active' },
);
assert.deepStrictEqual(
  createLabelsForNewProfile({
    classification: { ownership: OWNERSHIP.NON_PURCHASER, sources: [] },
    earnedPurchaseBook: true,
  }),
  { source: 'Website', readerType: 'purchased', status: 'active' },
);

const snapshot = buildLeadAttributionSnapshot({
  visitorId: 'vid-1',
  captureSurface: 'bridge',
  retailerOrigin: 'amazon',
  utm: { utm_source: 'meta' },
});
assert.strictEqual(snapshot.captureSurface, 'bridge');
assert.strictEqual(snapshot.retailerOrigin, 'amazon');
assert.ok(snapshot.capturedAt);
assert.strictEqual(snapshot.enrolledAt, undefined);

const helperSrc = fs.readFileSync(path.join(__dirname, '../lib/readers/readersAgreeLead.cjs'), 'utf8');
const leadSrc = fs.readFileSync(path.join(__dirname, '../api/readersAgree/lead.cjs'), 'utf8');
assert.doesNotMatch(helperSrc, /prospectNurtureEnrolledAt\s*:/);
assert.doesNotMatch(helperSrc, /trySendProspectNurture/);
assert.doesNotMatch(helperSrc, /send-prospect-nurture/);
assert.doesNotMatch(leadSrc, /trySendProspectNurture/);
assert.doesNotMatch(leadSrc, /prospectNurtureEnrolledAt/);
assert.doesNotMatch(leadSrc, /TRANSACTIONAL_EMAIL_ENABLED/);

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const handler = require('../api/readersAgree/lead.cjs');

(async () => {
  const missing = mockRes();
  await handler({ body: {} }, missing);
  assert.strictEqual(missing.statusCode, 400);
  assert.strictEqual(missing.body.error, 'email_required');

  const invalid = mockRes();
  await handler({ body: { email: 'not-an-email' } }, invalid);
  assert.strictEqual(invalid.statusCode, 400);
  assert.strictEqual(invalid.body.error, 'invalid_email');

  console.log('verify-readers-agree-lead: PASS');
})().catch((err) => {
  console.error('verify-readers-agree-lead: FAIL', err);
  process.exit(1);
});
