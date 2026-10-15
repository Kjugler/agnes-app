// Signed Readers Agree browser session.
// HttpOnly cookie value. Disjoint typ from remember_place, reader_claim, and ebook tokens.
// A raw user id is never a valid session.

const crypto = require('crypto');
const envConfig = require('../config/env.cjs');

const SESSION_TYP = 'readers_agree_session';
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 2000;

function getSecret() {
  const secret = envConfig.FULFILLMENT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[READERS_AGREE_SESSION] FULFILLMENT_TOKEN_SECRET must be at least 32 characters');
  }
  return secret;
}

function signReadersAgreeSession(userId, options = {}) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid || uid.length > 64) {
    throw new Error('[READERS_AGREE_SESSION] userId is required');
  }
  const ttl =
    Number.isFinite(options.ttlSeconds) && options.ttlSeconds !== 0
      ? options.ttlSeconds
      : DEFAULT_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payloadStr = JSON.stringify({ typ: SESSION_TYP, uid, exp });
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(payloadStr);
  const signature = hmac.digest('base64url');
  return `${Buffer.from(payloadStr).toString('base64url')}.${signature}`;
}

function signaturesMatch(provided, expected) {
  const sigBuf = Buffer.from(provided, 'base64url');
  const expectedBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expectedBuf.length) {
    if (sigBuf.length > 0) crypto.timingSafeEqual(sigBuf, sigBuf);
    return false;
  }
  if (sigBuf.length === 0) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * @param {string} token
 * @returns {{ userId: string, exp: number } | null}
 */
function verifyReadersAgreeSession(token) {
  if (!token || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  let secret;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  let payloadStr;
  try {
    payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadStr);
  if (!signaturesMatch(signature, hmac.digest('base64url'))) return null;

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return null;
  }
  if (!payload || payload.typ !== SESSION_TYP) return null;
  if (typeof payload.uid !== 'string' || !payload.uid.trim() || payload.uid.length > 64) return null;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { userId: payload.uid, exp: payload.exp };
}

/**
 * Recognition hint. Never returns the full local part.
 * @param {string} email
 * @returns {string | null}
 */
function maskEmailForRecognition(email) {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at >= normalized.length - 1) return null;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || local.length > 64 || domain.length > 255) return null;
  if (/\s/.test(local) || /\s/.test(domain) || domain.includes('@')) return null;
  return `${local.slice(0, 1)}•••@${domain}`;
}

module.exports = {
  SESSION_TYP,
  DEFAULT_TTL_SECONDS,
  signReadersAgreeSession,
  verifyReadersAgreeSession,
  maskEmailForRecognition,
};
