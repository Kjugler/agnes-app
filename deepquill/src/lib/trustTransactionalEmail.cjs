/**
 * Optional short transactional emails sent *before* the full strategic email (Choice B).
 * Does not replace or duplicate strategic content — additive only.
 * Gated by EMAIL_SPLIT_TRUST_EMAIL=1
 *
 * From-address is set in stripe-webhook.cjs: default no-reply@theagnesprotocol.com
 * (override MAILCHIMP_TRUST_FROM_EMAIL). Strategic emails still use MAILCHIMP_FROM_EMAIL.
 */

function isTrustSplitEmailEnabled() {
  return process.env.EMAIL_SPLIT_TRUST_EMAIL === '1';
}

/**
 * Minimal purchase receipt ping (strategic email unchanged; sent first when flag on).
 */
function buildTrustPurchaseEmail({ sessionId, product }) {
  const productLabel =
    {
      paperback: 'Paperback',
      ebook: 'eBook',
      audio_preorder: 'Audio Book (Preorder)',
    }[product] || 'Order';

  const subject = 'Your payment was received';

  const text = `
Thank you — we've received your order.

Reference: ${sessionId}
Item: ${productLabel}

You'll receive a separate email shortly with full order details, points, and any download links.

Questions? hello@theagnesprotocol.com
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;color:#111;">
  <p style="margin:0 0 12px 0;font-size:16px;">Thank you — we've received your order.</p>
  <p style="margin:0 0 8px 0;font-size:14px;"><strong>Reference:</strong> ${String(sessionId).replace(/</g, '&lt;')}</p>
  <p style="margin:0 0 16px 0;font-size:14px;"><strong>Item:</strong> ${String(productLabel).replace(/</g, '&lt;')}</p>
  <p style="margin:0 0 12px 0;font-size:14px;color:#444;">You'll receive a separate email shortly with full order details, points, and any download links.</p>
  <p style="margin:0;font-size:14px;">Questions? <a href="mailto:hello@theagnesprotocol.com">hello@theagnesprotocol.com</a></p>
</body></html>
`.trim();

  return { subject, text, html };
}

/**
 * Minimal referrer ping (full strategic email unchanged; sent first when flag on).
 */
function buildTrustReferralEmail({ sessionId }) {
  const subject = 'Activity on your referral link';

  const text = `
We recorded a purchase attributed to your referral.

Reference: ${sessionId}

A separate email follows with full rewards and contest details.
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;color:#111;">
  <p style="margin:0 0 12px 0;font-size:16px;">We recorded a purchase attributed to your referral.</p>
  <p style="margin:0 0 12px 0;font-size:14px;"><strong>Reference:</strong> ${String(sessionId).replace(/</g, '&lt;')}</p>
  <p style="margin:0;font-size:14px;color:#444;">A separate email follows with full rewards and contest details.</p>
</body></html>
`.trim();

  return { subject, text, html };
}

module.exports = {
  isTrustSplitEmailEnabled,
  buildTrustPurchaseEmail,
  buildTrustReferralEmail,
};
