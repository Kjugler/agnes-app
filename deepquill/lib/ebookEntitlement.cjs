/**
 * Paid Stripe checkout is the only session-based ebook entitlement.
 * A missing session or an unpaid session does not entitle a download.
 * A zero amount is not, by itself, an entitlement.
 */

function paidCheckoutEntitlesEbook(session, productType) {
  if (!session || typeof session !== 'object') return false;
  if (session.payment_status !== 'paid') return false;
  return productType === 'ebook' || productType === 'paperback';
}

module.exports = {
  paidCheckoutEntitlesEbook,
};
