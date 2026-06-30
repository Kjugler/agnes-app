const { isMailableEmail } = require('../../src/lib/normalize.cjs');

function getSiteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    'https://www.theagnesprotocol.com'
  ).replace(/\/$/, '');
}

function buildTextAFriendUrl(referralCode, email) {
  const base = getSiteUrl();
  const code = (referralCode || '').trim();
  const em = isMailableEmail(email);
  if (!code) return `${base}/text-a-friend`;
  const u = new URL(`${base}/text-a-friend`);
  u.searchParams.set('ref', code);
  if (em) u.searchParams.set('email', em);
  return u.toString();
}

function buildSampleChaptersUrl(referralCode) {
  const base = getSiteUrl();
  const code = (referralCode || '').trim();
  if (!code) return `${base}/sample-chapters`;
  const u = new URL(`${base}/sample-chapters`);
  u.searchParams.set('ref', code);
  return u.toString();
}

module.exports = {
  getSiteUrl,
  buildTextAFriendUrl,
  buildSampleChaptersUrl,
};
