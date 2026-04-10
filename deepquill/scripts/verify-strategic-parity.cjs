/**
 * Proof: strategic email output (purchase + referral) matches committed golden files.
 * Run: node scripts/verify-strategic-parity.cjs
 * CI: exit 1 on any mismatch (proves builders + banner path unchanged vs baseline).
 *
 * Golden files: scripts/email-split-proof/no-banner/ (regenerate via render-email-baseline-proof.cjs)
 */
const fs = require('fs');
const pathMod = require('path');

process.env.STRESS_TEST_MODE = '0';
process.env.EMAIL_CONTEST_BANNER = '';

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

const goldenDir = pathMod.join(__dirname, 'email-split-proof', 'no-banner');

/** Normalize newlines so Windows CRLF goldens match LF output */
function norm(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function cmp(name, got, relativePath) {
  const p = pathMod.join(goldenDir, relativePath);
  if (!fs.existsSync(p)) {
    console.error('Missing golden file:', p);
    process.exit(1);
  }
  const want = norm(fs.readFileSync(p, 'utf8'));
  const actual = norm(got);
  if (actual !== want) {
    console.error(`\n[FAIL] ${name} mismatch vs ${relativePath}`);
    console.error('--- expected (first 500 chars) ---\n', want.slice(0, 500));
    console.error('--- actual (first 500 chars) ---\n', actual.slice(0, 500));
    process.exit(1);
  }
  console.log('[OK]', name);
}

const pRaw = buildPurchaseConfirmationEmail(fixtures.purchase);
const pFinal = applyGlobalEmailBanner({
  html: pRaw.html,
  text: pRaw.text,
  subject: pRaw.subject,
});
cmp('purchase subject', pFinal.subject, 'purchase.subject.txt');
cmp('purchase text', pFinal.text, 'purchase.text.txt');
cmp('purchase html', pFinal.html, 'purchase.html');

const rRaw = buildReferrerCommissionEmail(fixtures.referral);
const rFinal = applyGlobalEmailBanner({
  html: rRaw.html,
  text: rRaw.text,
  subject: rRaw.subject,
});
cmp('referral subject', rFinal.subject, 'referral.subject.txt');
cmp('referral text', rFinal.text, 'referral.text.txt');
cmp('referral html', rFinal.html, 'referral.html');

console.log('\nStrategic parity check passed (all golden files match).');
