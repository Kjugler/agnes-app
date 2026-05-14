// Signed, short-lived token for POST-purchase reader profile claim links.
// Uses FULFILLMENT_TOKEN_SECRET (same key material as eBook download tokens; payload is disjoint).

const crypto = require('crypto');
const envConfig = require('../config/env.cjs');

const CLAIM_TYP = 'reader_claim';

function getSecret() {
  const secret = envConfig.FULFILLMENT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[READER_CLAIM_TOKEN] FULFILLMENT_TOKEN_SECRET must be at least 32 characters');
  }
  return secret;
}

function ttlSeconds() {
  const days = parseInt(process.env.READER_CLAIM_TOKEN_TTL_DAYS || '14', 10);
  if (!Number.isFinite(days) || days < 1) return 14 * 24 * 60 * 60;
  return days * 24 * 60 * 60;
}

/**
 * @param {{ userId: string, email: string, purchaseId: string, sessionId: string }} payload
 * @returns {string}
 */
function signReaderClaimToken({ userId, email, purchaseId, sessionId }) {
  if (!userId || !email || !purchaseId || !sessionId) {
    throw new Error('[READER_CLAIM_TOKEN] userId, email, purchaseId, and sessionId are required');
  }
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds();
  const data = {
    typ: CLAIM_TYP,
    uid: String(userId),
    em: String(email).trim().toLowerCase(),
    pid: String(purchaseId),
    sid: String(sessionId),
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
 * @returns {{ userId: string, email: string, purchaseId: string, sessionId: string, exp: number } | null}
 */
function verifyReaderClaimToken(token) {
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
    if (payload.typ !== CLAIM_TYP) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (!payload.uid || !payload.em || !payload.pid || !payload.sid) return null;
    return {
      userId: payload.uid,
      email: payload.em,
      purchaseId: payload.pid,
      sessionId: payload.sid,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

module.exports = {
  signReaderClaimToken,
  verifyReaderClaimToken,
  CLAIM_TYP,
};
