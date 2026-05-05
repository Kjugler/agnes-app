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

function buildReadyToSendMessage(referralLink, chapter9Link) {
  return [
    'Something is opening — quietly.',
    '',
    'Not everything is being explained yet.',
    '',
    'Start here:',
    referralLink,
    '',
    'Or read this first:',
    chapter9Link,
    '',
    'Take your time.',
    '',
    '— Simon McQuade',
  ].join('\n');
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
