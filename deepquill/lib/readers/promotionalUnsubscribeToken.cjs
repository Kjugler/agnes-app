/**
 * Login-free promotional unsubscribe token.
 * Bound to one reader id and one normalized email. No reading-access privilege.
 *
 * New tokens are signed only with PROMOTIONAL_UNSUBSCRIBE_SECRET.
 * Existing tokens signed with the previous fulfillment secret still verify
 * when that value is present in FULFILLMENT_TOKEN_SECRET_LEGACY.
 * Ebook, claim, session, remember-place, and reading-allowance tokens do not
 * use either of those checks.
 */

const crypto = require('crypto');
const { getSiteUrl } = require('./readerUrls.cjs');

const TYP = 'promotional_unsubscribe';

function configuredSecret(name) {
  const secret = process.env[name] || '';
  return secret.length >= 32 ? secret : '';
}

function signingSecret() {
  const secret = configuredSecret('PROMOTIONAL_UNSUBSCRIBE_SECRET');
  if (!secret) {
    throw new Error('PROMOTIONAL_UNSUBSCRIBE_SECRET must be at least 32 characters');
  }
  return secret;
}

function verificationSecrets() {
  const secrets = [];
  const current = configuredSecret('PROMOTIONAL_UNSUBSCRIBE_SECRET');
  if (current) secrets.push(current);
  const legacy = configuredSecret('FULFILLMENT_TOKEN_SECRET_LEGACY');
  if (legacy && !secrets.includes(legacy)) secrets.push(legacy);
  return secrets;
}

function signPayload(secret, payload) {
  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
  return `${Buffer.from(payloadStr).toString('base64url')}.${signature}`;
}

function signatureMatches(secret, payloadStr, signature) {
  const expected = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
}

function signPromotionalUnsubscribeToken({ userId, email }) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  const em = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!uid || !em) throw new Error('userId and email are required');
  const data = { typ: TYP, uid, em };
  return signPayload(signingSecret(), data);
}

function verifyPromotionalUnsubscribeToken(token) {
  if (!token || typeof token !== 'string') return null;
  const secrets = verificationSecrets();
  if (secrets.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  let payloadStr;
  try {
    payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!secrets.some((secret) => signatureMatches(secret, payloadStr, signature))) return null;
  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return null;
  }
  if (payload.typ !== TYP || !payload.uid || !payload.em) return null;
  return { userId: payload.uid, email: String(payload.em).trim().toLowerCase() };
}

function promotionalUnsubscribePath(token) {
  return `/preferences/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Unsubscribe URL for a future promotional message.
 * Pass the reader's current email. This does not send mail.
 */
function buildPromotionalUnsubscribeUrl({ userId, email, siteUrl } = {}) {
  const token = signPromotionalUnsubscribeToken({ userId, email });
  const base = (siteUrl || getSiteUrl()).replace(/\/$/, '');
  return `${base}${promotionalUnsubscribePath(token)}`;
}

module.exports = {
  TYP,
  signPromotionalUnsubscribeToken,
  verifyPromotionalUnsubscribeToken,
  promotionalUnsubscribePath,
  buildPromotionalUnsubscribeUrl,
};
