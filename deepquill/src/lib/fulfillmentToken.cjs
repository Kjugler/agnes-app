// deepquill/src/lib/fulfillmentToken.cjs
// Secure token signing/verification for eBook download links

const crypto = require('crypto');
const envConfig = require('../config/env.cjs');

const TTL_DAYS = envConfig.EBOOK_LINK_TTL_DAYS || 7;

/**
 * Get secret with validation (lazy - only validates when used)
 */
function getSecret() {
  const secret = envConfig.FULFILLMENT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[FULFILLMENT_TOKEN] FULFILLMENT_TOKEN_SECRET must be at least 32 characters');
  }
  return secret;
}

/**
 * Generate a signed token for eBook download
 * 
 * @param {Object} payload
 * @param {string} payload.email - Customer email
 * @param {string} payload.sessionId - Stripe session ID
 * @returns {string} Signed token (base64url encoded)
 */
function signToken(payload) {
  const { email, sessionId } = payload;
  
  if (!email || !sessionId) {
    throw new Error('[FULFILLMENT_TOKEN] email and sessionId are required');
  }

  const secret = getSecret(); // Validate secret when actually using it

  const exp = Math.floor(Date.now() / 1000) + (TTL_DAYS * 24 * 60 * 60);
  const data = {
    email,
    sessionId,
    exp,
  };

  const payloadStr = JSON.stringify(data);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadStr);
  const signature = hmac.digest('base64url');

  // Combine payload + signature
  const token = Buffer.from(payloadStr).toString('base64url') + '.' + signature;
  
  return token;
}

/**
 * Verify and decode a signed token
 * 
 * @param {string} token - Signed token
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    // Check if secret is configured (fail gracefully if not)
    let secret;
    try {
      secret = getSecret();
    } catch (err) {
      console.error('[FULFILLMENT_TOKEN] Cannot verify token - secret not configured:', err.message);
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [payloadB64, signature] = parts;
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadStr);

    // Verify signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest('base64url');

    // Constant-time comparison (ensure buffers are same length)
    const sigBuf = Buffer.from(signature, 'base64url');
    const expectedBuf = Buffer.from(expectedSignature, 'base64url');
    if (sigBuf.length !== expectedBuf.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken,
  TTL_DAYS,
};

