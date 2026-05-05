const { normalizeReferralCode } = require('../src/lib/normalize.cjs');

const REP_ROLES = new Set(['regional', 'podcaster']);

function getSiteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://www.theagnesprotocol.com'
  ).replace(/\/$/, '');
}

function buildReferralLink(referralCode) {
  const base = getSiteUrl();
  const code = normalizeReferralCode(referralCode);
  return `${base}/start?ref=${encodeURIComponent(code)}`;
}

function buildChapter9Link(referralCode) {
  const base = getSiteUrl();
  const code = normalizeReferralCode(referralCode);
  return `${base}/read/chapter9?ref=${encodeURIComponent(code)}&source=chapter9`;
}

function buildDiscountCode(referralCode) {
  const code = normalizeReferralCode(referralCode);
  return `${code}15`;
}

function buildReadyToSendMessage(referralCode) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return '';
  const referralLink = buildReferralLink(code);
  const chapter9Link = buildChapter9Link(code);

  return `Something is opening — quietly.

Read this first:
${chapter9Link}

This part stood out to me. Curious what you think.

If you want to go further, use this:
${referralLink}

(It'll take 15% off, and if you end up sharing it too, you'll get the same deal.)

Take your time.

— Simon McQuade`;
}

function normalizeRepRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return REP_ROLES.has(r) ? r : null;
}

/** @returns {{ ok: true, code: string } | { ok: false, error: string }} */
function validateRepReferralCode(code) {
  const c = normalizeReferralCode(code);
  if (!c) return { ok: false, error: 'Referral code is required or invalid' };
  if (!/^[A-Z0-9]{3,12}$/.test(c)) {
    return { ok: false, error: 'Referral code must be 3–12 letters or digits' };
  }
  return { ok: true, code: c };
}

module.exports = {
  REP_ROLES,
  getSiteUrl,
  buildReferralLink,
  buildChapter9Link,
  buildDiscountCode,
  buildReadyToSendMessage,
  normalizeRepRole,
  validateRepReferralCode,
};
