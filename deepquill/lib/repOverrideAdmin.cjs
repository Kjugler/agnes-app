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

function buildDiscountCode(referralCode) {
  const code = normalizeReferralCode(referralCode);
  return `${code}15`;
}

function buildReadyToSendMessage(referralLink) {
  return [
    'Something is opening — quietly.',
    '',
    'Not everything is being explained yet.',
    '',
    'A small group is getting early access before anything is officially announced.',
    '',
    'No rollout. No noise. Just… access.',
    '',
    'April 30 – May 1',
    '',
    `Start here:\n${referralLink}`,
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
  buildDiscountCode,
  buildReadyToSendMessage,
  normalizeRepRole,
  validateRepReferralCode,
};
