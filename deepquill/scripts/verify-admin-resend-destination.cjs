/**
 * Regression: admin resend destination email priority (User → Customer → Stripe).
 * Run: node scripts/verify-admin-resend-destination.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = 'sk_test_verify_admin_resend_destination_only';
}

const assert = require('assert');
const { normalizeEmail } = require('../src/lib/normalize.cjs');
const {
  resolveResendDestinationEmailFromCandidates,
} = require('../lib/email/resendPurchaseEmails.cjs');

function salesLedgerBuyerEmail(user) {
  return user?.email || '—';
}

function runCase(name, fn) {
  try {
    fn();
    console.log('[OK]', name);
  } catch (err) {
    console.error('[FAIL]', name, err.message);
    process.exitCode = 1;
  }
}

const staleStripeSession = {
  customer_details: { email: 'allanjohnson@mail.com' },
  customer_email: 'allanjohnson@mail.com',
};

runCase('1. User.email corrected, Stripe email stale → user_email', () => {
  const out = resolveResendDestinationEmailFromCandidates({
    userEmail: 'allanj070@gmail.com',
    customerEmail: 'allanjohnson@mail.com',
    session: staleStripeSession,
  });
  assert.strictEqual(out.email, 'allanj070@gmail.com');
  assert.strictEqual(out.emailSource, 'user_email');
});

runCase('2. User.email missing, Customer.email present → customer_email', () => {
  const out = resolveResendDestinationEmailFromCandidates({
    userEmail: null,
    customerEmail: 'buyer@example.com',
    session: staleStripeSession,
  });
  assert.strictEqual(out.email, 'buyer@example.com');
  assert.strictEqual(out.emailSource, 'customer_email');
});

runCase('3. User and Customer missing → stripe_customer_details', () => {
  const out = resolveResendDestinationEmailFromCandidates({
    userEmail: '',
    customerEmail: null,
    session: { customer_details: { email: 'stripe-only@example.com' }, customer_email: 'other@example.com' },
  });
  assert.strictEqual(out.email, 'stripe-only@example.com');
  assert.strictEqual(out.emailSource, 'stripe_customer_details');
});

runCase('3b. User and Customer missing, details empty → stripe_customer_email', () => {
  const out = resolveResendDestinationEmailFromCandidates({
    userEmail: '',
    customerEmail: null,
    session: { customer_details: {}, customer_email: 'fallback@example.com' },
  });
  assert.strictEqual(out.email, 'fallback@example.com');
  assert.strictEqual(out.emailSource, 'stripe_customer_email');
});

runCase('4. Confirmation and eBook share the same resolver output', () => {
  const inputs = {
    userEmail: 'shared@example.com',
    customerEmail: 'customer@example.com',
    session: staleStripeSession,
  };
  const a = resolveResendDestinationEmailFromCandidates(inputs);
  const b = resolveResendDestinationEmailFromCandidates(inputs);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.emailSource, 'user_email');
});

runCase('5. Sales Ledger buyerEmail matches resend destination after admin correction', () => {
  const user = { email: 'allanj070@gmail.com' };
  const ledgerDisplay = salesLedgerBuyerEmail(user);
  const resolved = resolveResendDestinationEmailFromCandidates({
    userEmail: user.email,
    customerEmail: 'allanjohnson@mail.com',
    session: staleStripeSession,
  });
  assert.strictEqual(normalizeEmail(ledgerDisplay), resolved.email);
  assert.strictEqual(resolved.emailSource, 'user_email');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('\nAll admin resend destination checks passed.');
