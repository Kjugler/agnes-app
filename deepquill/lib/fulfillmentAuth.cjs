// deepquill/lib/fulfillmentAuth.cjs
// Auth helper for fulfillment API - requires x-fulfillment-token or x-admin-key

const FULFILLMENT_TOKEN = process.env.FULFILLMENT_ACCESS_TOKEN || null;
const ADMIN_KEY = process.env.ADMIN_KEY || null;

/**
 * Validate fulfillment request. Returns { valid: true } or { valid: false, status, message }.
 */
function validateFulfillmentAuth(req) {
  const token = (req.headers['x-fulfillment-token'] || '').trim();
  const adminKey = (req.headers['x-admin-key'] || '').trim();

  const expectedToken = FULFILLMENT_TOKEN || ADMIN_KEY;
  if (!expectedToken) {
    return {
      valid: false,
      status: 503,
      message: 'Fulfillment auth not configured. Set FULFILLMENT_ACCESS_TOKEN or ADMIN_KEY.',
    };
  }

  const provided = token || adminKey;
  if (!provided || provided !== expectedToken) {
    return {
      valid: false,
      status: 401,
      message: 'Invalid or missing x-fulfillment-token (or x-admin-key).',
    };
  }

  return { valid: true };
}

/**
 * Express middleware - rejects with 401/503 if auth invalid.
 */
function requireFulfillmentAuth(req, res, next) {
  const result = validateFulfillmentAuth(req);
  if (!result.valid) {
    return res.status(result.status).json({ error: result.message });
  }
  next();
}

module.exports = {
  validateFulfillmentAuth,
  requireFulfillmentAuth,
};
