// Signed, short-lived token for Jody "Remember My Place" email verification.
// Uses FULFILLMENT_TOKEN_SECRET (disjoint typ from reader_claim and eBook tokens).

const crypto = require('crypto');
const envConfig = require('../config/env.cjs');

const REMEMBER_TYP = 'remember_place';

function getSecret() {
  const secret = envConfig.FULFILLMENT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[REMEMBER_PLACE_TOKEN] FULFILLMENT_TOKEN_SECRET must be at least 32 characters');
  }
  return secret;
}

function ttlSeconds() {
  const hours = parseInt(process.env.JODY_REMEMBER_TOKEN_TTL_HOURS || '24', 10);
  if (!Number.isFinite(hours) || hours < 1) return 24 * 60 * 60;
  return hours * 60 * 60;
}

/**
 * @param {{ userId: string, email: string, chapterId: string }} payload
 * @returns {string}
 */
function signRememberPlaceToken({ userId, email, chapterId }) {
  if (!userId || !email || !chapterId) {
    throw new Error('[REMEMBER_PLACE_TOKEN] userId, email, and chapterId are required');
  }
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds();
  const data = {
    typ: REMEMBER_TYP,
    uid: String(userId),
    em: String(email).trim().toLowerCase(),
    ch: String(chapterId),
    exp,
  };
  const payloadStr = JSON.stringify(data);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadStr);
  const signature = hmac.digest('base64url');
  return Buffer.from(payloadStr).toString('base64url') + '.' + signature;
}

/**
 * @param {string} token
 * @returns {{ userId: string, email: string, chapterId: string, exp: number } | null}
 */
function verifyRememberPlaceToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    let secret;
    try {
      secret = getSecret();
    } catch {
      return null;
    }
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, signature] = parts;
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadStr);

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest('base64url');
    const sigBuf = Buffer.from(signature, 'base64url');
    const expectedBuf = Buffer.from(expectedSignature, 'base64url');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    if (payload.typ !== REMEMBER_TYP) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (!payload.uid || !payload.em || !payload.ch) return null;
    return {
      userId: payload.uid,
      email: payload.em,
      chapterId: payload.ch,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

module.exports = {
  signRememberPlaceToken,
  verifyRememberPlaceToken,
  REMEMBER_TYP,
};
