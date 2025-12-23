// deepquill/src/lib/purchaseEmail.cjs
// Email template for purchase confirmation/receipt

/**
 * Build purchase confirmation email
 * 
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {string} params.sessionId - Stripe checkout session ID
 * @param {string} params.product - Product purchased (paperback, ebook, audio_preorder)
 * @param {number} params.amountTotal - Total amount in cents
 * @param {string} params.currency - Currency code (e.g., 'usd')
 * @returns {Object} { subject, text, html }
 */
function buildPurchaseConfirmationEmail({ email, sessionId, product, amountTotal, currency = 'usd' }) {
  const amount = (amountTotal / 100).toFixed(2);
  const productName = {
    paperback: 'Paperback',
    ebook: 'eBook',
    audio_preorder: 'Audio Book (Preorder)',
  }[product] || 'Product';
  
  const subject = `Order Confirmation - The Agnes Protocol ${productName}`;
  
  const text = `
Thank you for your purchase!

Order Details:
- Product: ${productName}
- Amount: $${amount} ${currency.toUpperCase()}
- Order ID: ${sessionId}

Your order is being processed. If you purchased a paperback, you'll receive a separate email with your free eBook download link shortly.

If you have any questions, please contact us at hello@theagnesprotocol.com.

Thank you for being part of The Agnes Protocol community.

—Vector 🛰️
DeepQuill LLC
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:40px 30px;">
              <h1 style="margin:0 0 20px 0;font-size:24px;color:#0a0a0a;">Thank you for your purchase!</h1>
              
              <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#333333;">
                Your order has been received and is being processed.
              </p>
              
              <div style="background-color:#f9f9f9;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">Order Details</h2>
                <p style="margin:8px 0;font-size:14px;line-height:1.6;color:#333333;">
                  <strong>Product:</strong> ${productName}
                </p>
                <p style="margin:8px 0;font-size:14px;line-height:1.6;color:#333333;">
                  <strong>Amount:</strong> $${amount} ${currency.toUpperCase()}
                </p>
                <p style="margin:8px 0;font-size:14px;line-height:1.6;color:#333333;">
                  <strong>Order ID:</strong> ${sessionId}
                </p>
              </div>
              
              ${product === 'paperback' ? `
              <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#333333;">
                <strong>Free eBook:</strong> As promised, you'll receive a separate email shortly with your free eBook download link.
              </p>
              ` : ''}
              
              <p style="margin:30px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                If you have any questions about your order, please contact us at 
                <a href="mailto:hello@theagnesprotocol.com" style="color:#00ff7f;">hello@theagnesprotocol.com</a>.
              </p>
              
              <p style="margin:30px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                Thank you for being part of The Agnes Protocol community.
              </p>
              
              <p style="margin:20px 0 0 0;font-size:13px;line-height:1.6;color:#999999;">
                —Vector 🛰️<br>
                DeepQuill LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

module.exports = {
  buildPurchaseConfirmationEmail,
};

