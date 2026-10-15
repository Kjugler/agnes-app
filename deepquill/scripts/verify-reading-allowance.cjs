/**
 * Server-side sample-reading allowance.
 * Time is credited from the server clock and capped per tick.
 *
 * Usage: node scripts/verify-reading-allowance.cjs
 */
const assert = require('node:assert/strict');

process.env.FULFILLMENT_TOKEN_SECRET = process.env.FULFILLMENT_TOKEN_SECRET || 'x'.repeat(40);
process.env.NODE_ENV = 'test';

const {
  LIMIT_MS,
  MAX_CREDIT_MS,
  allowanceLimitMs,
  applyReadingTick,
  freshAllowanceState,
  publicAllowance,
  readAllowanceToken,
  signAllowanceState,
} = require('../src/lib/readingAllowance.cjs');

const limit = 90_000;

function tick(state, now, extra) {
  return applyReadingTick(state, { now, limitMs: limit, ...extra });
}

let state = freshAllowanceState(0);
state = tick(state, 0, { active: true, chapterId: '1', page: 1 });
assert.equal(state.accumulatedMs, 0, 'the first tick only starts the clock');

state = tick(state, 2_000, { active: true, chapterId: '1', page: 1 });
assert.equal(state.accumulatedMs, 2_000);

state = tick(state, 12_000, { active: true, chapterId: '2', page: 3 });
assert.equal(state.accumulatedMs, 2_000 + MAX_CREDIT_MS, 'a long gap cannot claim the whole gap');
assert.equal(state.chapterId, '2');
assert.equal(state.page, 3);
assert.equal(state.exhausted, false);

const beforeSwitch = state.accumulatedMs;
state = tick(state, 14_000, { active: true, chapterId: '9', page: 1 });
assert.equal(state.accumulatedMs, beforeSwitch + 2_000, 'switching chapters keeps the same allowance');

let spam = freshAllowanceState(0);
spam = tick(spam, 0, { active: true });
for (let t = 100; t <= 5_000; t += 100) {
  spam = tick(spam, t, { active: true, chapterId: '45', page: 2 });
}
assert.equal(spam.accumulatedMs, 5_000, 'faster ticks cannot outrun the server clock');

let idle = freshAllowanceState(0);
idle = tick(idle, 0, { active: true });
idle = tick(idle, 60_000, { active: false, chapterId: '1', page: 4 });
assert.equal(idle.accumulatedMs, 0, 'inactive time does not count');
idle = tick(idle, 62_000, { active: true, chapterId: '1', page: 4 });
assert.equal(idle.accumulatedMs, 2_000);

let done = freshAllowanceState(0);
done.accumulatedMs = 89_000;
done.lastTickAt = 0;
done = tick(done, 2_000, { active: true, chapterId: '1', page: 6 });
assert.equal(done.accumulatedMs, 90_000);
assert.equal(done.exhausted, true);
assert.equal(publicAllowance(done, limit).remainingMs, 0);

const declined = tick(freshAllowanceState(1_000), 1_000, { decline: true, chapterId: '9', page: 2 });
assert.equal(declined.exhausted, true);
assert.equal(declined.accumulatedMs, limit);
assert.equal(publicAllowance(declined, limit).exhausted, true);

const token = signAllowanceState(done);
const read = readAllowanceToken(token, 1_000);
assert.equal(read.ok, true);
assert.equal(read.state.accumulatedMs, 90_000);
assert.equal(read.state.chapterId, '1');
assert.equal(read.state.page, 6);

const tampered = `${token.slice(0, -4)}aaaa`;
assert.equal(readAllowanceToken(tampered, 1_000).reason, 'tampered');
assert.equal(readAllowanceToken('not-a-token', 1_000).reason, 'tampered');

const expiredState = freshAllowanceState(0);
expiredState.exp = 10;
const expired = signAllowanceState(expiredState);
assert.equal(readAllowanceToken(expired, 20_000).reason, 'expired');

assert.equal(allowanceLimitMs('production', '3000'), LIMIT_MS);
assert.equal(allowanceLimitMs('production', '8000'), LIMIT_MS);
assert.equal(allowanceLimitMs('PRODUCTION', '8000'), LIMIT_MS);
assert.equal(allowanceLimitMs('', '8000'), LIMIT_MS);
assert.equal(allowanceLimitMs(undefined, '8000'), LIMIT_MS);
assert.equal(allowanceLimitMs('prod', '8000'), LIMIT_MS);
assert.equal(allowanceLimitMs('development', '8000'), 8000);
assert.equal(allowanceLimitMs('test', '8000'), 8000);
assert.equal(allowanceLimitMs('development', '50'), LIMIT_MS);
assert.equal(allowanceLimitMs('development', '90001'), LIMIT_MS);

console.log(JSON.stringify({ pass: true, limitMs: LIMIT_MS, maxCreditMs: MAX_CREDIT_MS }));
