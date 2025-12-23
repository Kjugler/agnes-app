// deepquill/src/config/env.cjs
// Validated environment variables with safe diagnostics

const STRIPE_SECRET_KEY_RAW = (process.env.STRIPE_SECRET_KEY || '').trim();

if (!STRIPE_SECRET_KEY_RAW) {
  throw new Error('[ENV] STRIPE_SECRET_KEY missing');
}

if (!/^sk_(test|live)_/.test(STRIPE_SECRET_KEY_RAW)) {
  throw new Error('[ENV] STRIPE_SECRET_KEY invalid format (must start with sk_test_ or sk_live_)');
}

exports.STRIPE_SECRET_KEY = STRIPE_SECRET_KEY_RAW;
exports.STRIPE_MODE = STRIPE_SECRET_KEY_RAW.startsWith('sk_live_') ? 'live' : 'test';
exports.STRIPE_KEY_FINGERPRINT = STRIPE_SECRET_KEY_RAW.slice(-6);

// Product price IDs
exports.STRIPE_PRICE_PAPERBACK = process.env.STRIPE_PRICE_PAPERBACK || null;
exports.STRIPE_PRICE_EBOOK = process.env.STRIPE_PRICE_EBOOK || null;
exports.STRIPE_PRICE_AUDIO_PREORDER = process.env.STRIPE_PRICE_AUDIO_PREORDER || null;

// Associate coupon
exports.STRIPE_ASSOCIATE_15_COUPON_ID = process.env.STRIPE_ASSOCIATE_15_COUPON_ID || null;

// Associate ref allowlist (fallback when Prisma unavailable)
const allowlistRaw = process.env.ASSOCIATE_REF_ALLOWLIST || '';
exports.ASSOCIATE_REF_ALLOWLIST = allowlistRaw
  .split(',')
  .map((code) => code.trim().toUpperCase())
  .filter((code) => code.length > 0);
exports.ASSOCIATE_REF_ALLOWLIST_MODE = (process.env.ASSOCIATE_REF_ALLOWLIST_MODE || 'allowlist').toLowerCase();

// Webhook secret (required for webhook signature verification)
exports.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || null;
if (!exports.STRIPE_WEBHOOK_SECRET) {
  console.warn('[ENV] STRIPE_WEBHOOK_SECRET not set - webhook signature verification will fail');
}

// Fulfillment token secret (for secure eBook download links)
exports.FULFILLMENT_TOKEN_SECRET = process.env.FULFILLMENT_TOKEN_SECRET || null;
if (!exports.FULFILLMENT_TOKEN_SECRET) {
  console.warn('[ENV] FULFILLMENT_TOKEN_SECRET not set - eBook download tokens will fail');
}

// eBook file path
exports.EBOOK_FILE_PATH = process.env.EBOOK_FILE_PATH || null;
if (!exports.EBOOK_FILE_PATH) {
  console.warn('[ENV] EBOOK_FILE_PATH not set - eBook downloads will fail');
}

// eBook link TTL (days)
exports.EBOOK_LINK_TTL_DAYS = parseInt(process.env.EBOOK_LINK_TTL_DAYS || '7', 10);

// Site URL (for download links)
exports.SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agnes-dev.ngrok-free.app';

// Other env vars
exports.NODE_ENV = process.env.NODE_ENV || 'development';
exports.DEBUG = process.env.DEBUG === 'true' || exports.NODE_ENV === 'development';

