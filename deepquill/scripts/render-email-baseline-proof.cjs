/**
 * Email Split (Choice B) — baseline proof renders.
 * Run from deepquill: node scripts/render-email-baseline-proof.cjs
 *
 * Sets banner-related env BEFORE loading emailBanner.cjs so module constants match intent.
 * Usage:
 *   EMAIL_BANNER=0 node scripts/render-email-baseline-proof.cjs   # no banner (clean baseline)
 *   EMAIL_BANNER=1 node scripts/render-email-baseline-proof.cjs   # banner on (matches typical .env)
 */
const fs = require('fs');
const path = require('path');

const bannerMode = process.env.EMAIL_BANNER === '1' ? 'with-banner' : 'no-banner';

/* emailBanner treats any non-empty EMAIL_CONTEST_BANNER (even "0") as banner-on. Only '' or unset disables. */
if (bannerMode === 'no-banner') {
  process.env.STRESS_TEST_MODE = '0';
  process.env.EMAIL_CONTEST_BANNER = '';
} else {
  process.env.STRESS_TEST_MODE = '0';
  process.env.EMAIL_CONTEST_BANNER = '1';
}

const { buildPurchaseConfirmationEmail } = require('../src/lib/purchaseEmail.cjs');
const { buildReferrerCommissionEmail } = require('../src/lib/referrerCommissionEmail.cjs');
const { applyGlobalEmailBanner } = require('../src/lib/emailBanner.cjs');

const fixtures = {
  purchase: {
    email: 'buyer@example.com',
    sessionId: 'cs_test_fixture_001',
    product: 'ebook',
    amountTotal: 999,
    currency: 'usd',
    downloadUrl:
      'https://www.theagnesprotocol.com/ebook/download?session_id=cs_test_fixture_001',
    pointsAwarded: { awarded: 500, reason: 'awarded' },
    totalPoints: 12500,
  },
  referral: {
    referrerEmail: 'referrer@example.com',
    referrerCode: 'KRIS123',
    buyerName: 'Alex',
    product: 'ebook',
    commissionCents: 200,
    pointsAwarded: { awarded: 1000, reason: 'awarded' },
    savingsCents: 390,
    totalEarningsCents: 400,
    totalPoints: 50000,
    totalSavingsCents: 1170,
  },
};

function extractLinks(html, text) {
  const urls = new Set();
  const re = /https?:\/\/[^\s"'<>)\]]+/g;
  for (const s of [html, text]) {
    if (!s) continue;
    const m = s.match(re);
    if (m) m.forEach((u) => urls.add(u.replace(/[.,;]+$/, '')));
  }
  const mailto = /mailto:[^\s"'<>]+/g;
  for (const s of [html, text]) {
    if (!s) continue;
    const m = s.match(mailto);
    if (m) m.forEach((u) => urls.add(u.split(/["']/)[0]));
  }
  return [...urls].sort();
}

const outDir = path.join(__dirname, 'email-split-proof', bannerMode);
fs.mkdirSync(outDir, { recursive: true });

const purchaseRaw = buildPurchaseConfirmationEmail(fixtures.purchase);
const purchaseFinal = applyGlobalEmailBanner({
  html: purchaseRaw.html,
  text: purchaseRaw.text,
  subject: purchaseRaw.subject,
});

const refRaw = buildReferrerCommissionEmail(fixtures.referral);
const refFinal = applyGlobalEmailBanner({
  html: refRaw.html,
  text: refRaw.text,
  subject: refRaw.subject,
});

fs.writeFileSync(path.join(outDir, 'purchase.subject.txt'), purchaseFinal.subject);
fs.writeFileSync(path.join(outDir, 'purchase.text.txt'), purchaseFinal.text);
fs.writeFileSync(path.join(outDir, 'purchase.html'), purchaseFinal.html);
fs.writeFileSync(path.join(outDir, 'referral.subject.txt'), refFinal.subject);
fs.writeFileSync(path.join(outDir, 'referral.text.txt'), refFinal.text);
fs.writeFileSync(path.join(outDir, 'referral.html'), refFinal.html);

const linksPurchase = extractLinks(purchaseFinal.html, purchaseFinal.text);
const linksReferral = extractLinks(refFinal.html, refFinal.text);
fs.writeFileSync(
  path.join(outDir, 'LINKS.json'),
  JSON.stringify({ purchase: linksPurchase, referral: linksReferral }, null, 2)
);

console.log('Wrote baseline proof to', outDir);
console.log('Banner mode:', bannerMode);
console.log('Purchase links:', linksPurchase.length, 'Referral links:', linksReferral.length);
