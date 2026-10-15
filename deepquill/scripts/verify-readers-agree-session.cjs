/**
 * Readers Agree session token: signature, expiry, typ, and email hint.
 * No database. No email send.
 * Run: node scripts/verify-readers-agree-session.cjs
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const envLocal = path.join(root, '.env.local');
const envFile = path.join(root, '.env');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: false });
if (fs.existsSync(envFile)) dotenv.config({ path: envFile, override: false });
process.env.FULFILLMENT_TOKEN_SECRET = 'test-readers-agree-session-secret-32b';

const {
  signReadersAgreeSession,
  verifyReadersAgreeSession,
  maskEmailForRecognition,
} = require('../src/lib/readersAgreeSessionToken.cjs');
const { signRememberPlaceToken } = require('../src/lib/rememberPlaceToken.cjs');

const userId = 'cmreadersession0001';
const token = signReadersAgreeSession(userId);
const verified = verifyReadersAgreeSession(token);
assert.equal(verified && verified.userId, userId);
assert.ok(verified.exp > Math.floor(Date.now() / 1000));

assert.equal(verifyReadersAgreeSession(userId), null, 'raw user id is not a session');
assert.equal(verifyReadersAgreeSession(''), null);
assert.equal(verifyReadersAgreeSession('not-a-token'), null);
assert.equal(verifyReadersAgreeSession(token + 'x'), null);

const [payload, signature] = token.split('.');
const flipped = `${payload.slice(0, 2)}${payload[2] === 'A' ? 'B' : 'A'}${payload.slice(3)}`;
assert.notEqual(flipped, payload);
assert.equal(verifyReadersAgreeSession(`${flipped}.${signature}`), null);
const badSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
assert.notEqual(badSignature, signature);
assert.equal(verifyReadersAgreeSession(`${payload}.${badSignature}`), null);

const expired = signReadersAgreeSession(userId, { ttlSeconds: -30 });
assert.equal(verifyReadersAgreeSession(expired), null);

const remember = signRememberPlaceToken({
  userId,
  email: 'reader@example.com',
  chapterId: '1',
});
assert.equal(verifyReadersAgreeSession(remember), null, 'remember-place token is a different typ');

const hint = maskEmailForRecognition('Jane.Reader@Example.com');
assert.equal(hint, 'j•••@example.com');
assert.equal(hint.includes('jane'), false);
assert.equal(maskEmailForRecognition('not-an-email'), null);
assert.equal(maskEmailForRecognition(''), null);

const leadSrc = fs.readFileSync(path.join(__dirname, '../api/readersAgree/lead.cjs'), 'utf8');
const sessionSrc = fs.readFileSync(path.join(__dirname, '../api/readersAgree/session.cjs'), 'utf8');
assert.match(leadSrc, /signReadersAgreeSession/);
assert.match(leadSrc, /x-readers-agree-issue-session/);
assert.match(leadSrc, /if \(sessionToken\) responseBody\.sessionToken = sessionToken/);
assert.doesNotMatch(leadSrc, /redirectPath,\s*sessionToken/);
assert.doesNotMatch(leadSrc, /cookies\.set/);
assert.match(sessionSrc, /verifyReadersAgreeSession/);
assert.match(sessionSrc, /prisma\.user\.findUnique/);
assert.match(sessionSrc, /maskEmailForRecognition/);
assert.doesNotMatch(sessionSrc, /readerProfile\.update/);
assert.doesNotMatch(sessionSrc, /sendEmail/);
assert.doesNotMatch(sessionSrc, /prospectNurtureEnrolledAt\s*:/);

console.log('verify-readers-agree-session: PASS');
