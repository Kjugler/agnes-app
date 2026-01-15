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
 * @param {string} params.downloadUrl - Download URL for eBook (optional)
 * @param {Object|number} params.pointsAwarded - Points award result {awarded: number, reason: string} OR number (for backward compat)
 * @param {number} params.totalPoints - Total points the user has (optional)
 * @returns {Object} { subject, text, html }
 */
function buildPurchaseConfirmationEmail({ email, sessionId, product, amountTotal, currency = 'usd', downloadUrl, pointsAwarded = 500, totalPoints }) {
  // Handle both new format (object) and old format (number) for backward compatibility
  const awardResult = typeof pointsAwarded === 'object' && pointsAwarded !== null 
    ? pointsAwarded 
    : { awarded: pointsAwarded || 0, reason: 'awarded' };
  const pointsEarned = awardResult.awarded;
  const amount = (amountTotal / 100).toFixed(2);
  const productName = {
    paperback: 'Paperback',
    ebook: 'eBook',
    audio_preorder: 'Audio Book (Preorder)',
  }[product] || 'Product';
  
  // eBook gets different subject
  const subject = product === 'ebook' 
    ? `Your eBook is ready: The Agnes Protocol`
    : `Order Confirmation - The Agnes Protocol ${productName}`;
  
  // Build points messaging based on award result
  let pointsText = '';
  let pointsHtml = '';
  
  if (pointsEarned > 0) {
    pointsText = totalPoints !== undefined 
      ? `\n🎉 You earned ${pointsEarned} points towards a free family vacation! Your total points: ${totalPoints}`
      : `\n🎉 You earned ${pointsEarned} points towards a free family vacation!`;
    
    pointsHtml = `
              <div style="background-color:#e8f5e9;border-left:4px solid #00ff7f;border-radius:6px;padding:20px;margin:20px 0;">
                <p style="margin:0 0 10px 0;font-size:16px;line-height:1.6;color:#0a0a0a;">
                  <strong>🎉 You earned ${pointsEarned} points towards a free family vacation!</strong>
                </p>
                ${totalPoints !== undefined ? `
                <p style="margin:0;font-size:14px;line-height:1.6;color:#333333;">
                  <strong>Your total points: ${totalPoints}</strong>
                </p>
                ` : ''}
              </div>`;
  } else {
    // Points were capped - explain why
    let reasonText = '';
    let optimizationTip = '';
    
    if (awardResult.reason === 'daily_cap') {
      reasonText = 'No additional purchase points were awarded today because purchase points are capped at 500 points per day, and you\'ve already received today\'s purchase credit.';
      optimizationTip = 'Come back on a different day to purchase another catalog item — you can earn purchase points on up to three separate days.';
    } else if (awardResult.reason === 'lifetime_cap') {
      reasonText = 'No additional purchase points were awarded because you\'ve already earned purchase points on the maximum of three separate days.';
      optimizationTip = 'You\'ve maximized your purchase points! Keep participating in other ways to earn more points.';
    } else {
      reasonText = 'No additional purchase points were awarded for this purchase.';
      optimizationTip = 'Purchase points are awarded once per day, up to three separate days total.';
    }
    
    pointsText = `\n\n✅ Purchase recorded.\n\n${reasonText}\n\nHow to maximize points next time:\n${optimizationTip}\n\nNothing is broken — the contest is designed to reward multi-day participation.`;
    
    pointsHtml = `
              <div style="background-color:#fff3cd;border-left:4px solid #ffc107;border-radius:6px;padding:20px;margin:20px 0;">
                <p style="margin:0 0 10px 0;font-size:16px;line-height:1.6;color:#0a0a0a;">
                  <strong>✅ Purchase recorded.</strong>
                </p>
                <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#333333;">
                  ${reasonText}
                </p>
                <div style="background-color:#f9f9f9;border-radius:4px;padding:15px;margin:15px 0 0 0;">
                  <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#0a0a0a;">
                    <strong>How to maximize points next time:</strong>
                  </p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#333333;">
                    ${optimizationTip}
                  </p>
                </div>
                <p style="margin:15px 0 0 0;font-size:13px;line-height:1.6;color:#666666;">
                  Nothing is broken — the contest is designed to reward multi-day participation.
                </p>
              </div>`;
  }

  const text = `
Thank you for your purchase!

Order Details:
- Product: ${productName}
- Amount: $${amount} ${currency.toUpperCase()}
- Order ID: ${sessionId}
${pointsText}

${(product === 'ebook' || product === 'paperback') && downloadUrl ? `
${product === 'ebook' ? 'Your eBook is ready for download! Click the link below to access your copy.' : 'As promised, your free eBook is ready! Click the link below to download your copy.'}

Download link: ${downloadUrl}

If you have trouble accessing your eBook, please contact us at hello@theagnesprotocol.com.
` : product === 'audio_preorder' ? `
Your audio book preorder is confirmed. You'll receive your download link when it's available.
` : `
Your order is being processed.
`}

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
              
              ${pointsHtml}
              
              ${(product === 'ebook' || product === 'paperback') && downloadUrl ? `
              <div style="margin:30px 0;text-align:center;">
                <a href="${downloadUrl}" style="display:inline-block;padding:14px 28px;background-color:#00ff7f;color:#000000;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">
                  ${product === 'ebook' ? 'Download eBook' : 'Download Your Free eBook'}
                </a>
              </div>
              <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                <strong>Having trouble?</strong> Contact us at <a href="mailto:hello@theagnesprotocol.com" style="color:#00ff7f;">hello@theagnesprotocol.com</a>
              </p>
              <p style="margin:10px 0 0 0;font-size:12px;line-height:1.6;color:#999999;">
                Tip: Add this email to your safe senders list to ensure you receive future updates.
              </p>
              ` : ''}
              
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

