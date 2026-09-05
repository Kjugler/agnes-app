// Minimal checks for /api/readers-agree/lead helpers (no DB writes).

const assert = require('assert');
const { buildRedirectPath } = require('../api/readersAgree/lead.cjs');

assert.strictEqual(buildRedirectPath({}), '/sample-chapters');
assert.strictEqual(
  buildRedirectPath({ ref: 'abc123', utm: { utm_source: 'meta' } }),
  '/sample-chapters?ref=abc123&utm_source=meta',
);
assert.strictEqual(
  buildRedirectPath({ code: 'xyz', utm: { fbclid: '1' } }),
  '/sample-chapters?code=xyz&fbclid=1',
);

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
