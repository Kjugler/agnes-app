/**
 * Login-free promotional unsubscribe token.
 * Bound to one reader id and one normalized email. No reading-access privilege.
 */

const crypto = require('crypto');
const { getSiteUrl } = require('./readerUrls.cjs');

const TYP = 'promotional_unsubscribe';

function getSecret() {
  const secret = process.env.FULFILLMENT_TOKEN_SECRET || '';
  if (secret.length < 32) {
    throw new Error('FULFILLMENT_TOKEN_SECRET must be at least 32 characters');
  }
  return secret;
}

function signPromotionalUnsubscribeToken({ userId, email }) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  const em = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!uid || !em) throw new Error('userId and email are required');
  const secret = getSecret();
  const data = { typ: TYP, uid, em };
  const payloadStr = JSON.stringify(data);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
  return `${Buffer.from(payloadStr).toString('base64url')}.${signature}`;
}

function verifyPromotionalUnsubscribeToken(token) {
  if (!token || typeof token !== 'string') return null;
  let secret;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  let payloadStr;
  try {
    payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
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
