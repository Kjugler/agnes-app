const assert = require('assert');
const {
  isSelfReferral,
  isSelfOwnedCode,
} = require('../src/lib/selfReferralGuards.cjs');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name} :: ${err.message}`);
    process.exitCode = 1;
  }
}

// Test 1 — Self invite creation
run('self invite creation blocked', () => {
  const blocked = isSelfReferral({
    buyerEmail: 'User@Example.com',
    sponsorEmail: ' user@example.com ',
    buyerUserId: 'u_1',
    sponsorUserId: 'u_1',
  });
  assert.strictEqual(blocked, true);
});

// Test 2 — Self-owned code at checkout
run('self-owned code blocked at checkout', () => {
  const blocked = isSelfOwnedCode({
    buyerEmail: 'buyer@example.com',
    ownerEmail: 'BUYER@example.com',
    buyerUserId: 'u_2',
    ownerUserId: 'u_2',
  });
  assert.strictEqual(blocked, true);
});

// Test 3 — McClane precedence case (self ignored, legit sponsor valid)
run('legitimate sponsor survives after self attempt', () => {
  const selfBlocked = isSelfReferral({
    buyerEmail: 'buyer@example.com',
    sponsorEmail: 'buyer@example.com',
    buyerUserId: 'buyer_1',
    sponsorUserId: 'buyer_1',
  });
  const legitAllowed = isSelfReferral({
    buyerEmail: 'buyer@example.com',
    sponsorEmail: 'sponsor@example.com',
    buyerUserId: 'buyer_1',
    sponsorUserId: 'sponsor_1',
  });
  assert.strictEqual(selfBlocked, true);
  assert.strictEqual(legitAllowed, false);
});

// Test 4 — Legacy bad data present (post-purchase guard still blocks)
run('legacy self-referral blocked at post-purchase', () => {
  const blocked = isSelfReferral({
    buyerEmail: 'legacy@example.com',
    sponsorEmail: 'legacy@example.com',
    buyerUserId: null,
    sponsorUserId: null,
  });
  assert.strictEqual(blocked, true);
});

// Test 5 — Normal valid referral
run('normal referral remains valid', () => {
  const blockedReferral = isSelfReferral({
    buyerEmail: 'buyer@example.com',
    sponsorEmail: 'friend@example.com',
    buyerUserId: 'buyer_5',
    sponsorUserId: 'sponsor_5',
  });
  const blockedCode = isSelfOwnedCode({
    buyerEmail: 'buyer@example.com',
    ownerEmail: 'friend@example.com',
    buyerUserId: 'buyer_5',
    ownerUserId: 'sponsor_5',
  });
  assert.strictEqual(blockedReferral, false);
  assert.strictEqual(blockedCode, false);
});

if (!process.exitCode) {
  console.log('ALL PASS');
}
