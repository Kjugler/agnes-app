const { normalizeEmail } = require('./normalize.cjs');

function normalizeIdentityEmail(email) {
  return normalizeEmail(email) || '';
}

function isSameUserId(a, b) {
  if (!a || !b) return false;
  return String(a).trim() === String(b).trim();
}

function isSelfReferral({ buyerEmail, sponsorEmail, buyerUserId, sponsorUserId }) {
  const be = normalizeIdentityEmail(buyerEmail);
  const se = normalizeIdentityEmail(sponsorEmail);
  if (isSameUserId(buyerUserId, sponsorUserId)) return true;
  if (be && se && be === se) return true;
  return false;
}

function isSelfOwnedCode({ buyerEmail, ownerEmail, buyerUserId, ownerUserId }) {
  const be = normalizeIdentityEmail(buyerEmail);
  const oe = normalizeIdentityEmail(ownerEmail);
  if (isSameUserId(buyerUserId, ownerUserId)) return true;
  if (be && oe && be === oe) return true;
  return false;
}

module.exports = {
  normalizeIdentityEmail,
  isSelfReferral,
  isSelfOwnedCode,
};
