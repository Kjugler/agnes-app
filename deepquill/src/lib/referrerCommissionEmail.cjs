// deepquill/src/lib/referrerCommissionEmail.cjs
// Email template for referrer commission notification

/**
 * Build referrer commission email
 * 
 * @param {Object} params
 * @param {string} params.referrerEmail - Referrer's email
 * @param {string} params.referrerCode - Referrer's code
 * @param {string} params.buyerName - Buyer's name (e.g., "Gus")
 * @param {string} params.product - Product purchased (paperback, ebook, audio_preorder)
 * @param {number} params.commissionCents - Commission amount in cents
 * @param {Object|number} params.pointsAwarded - Points award result {awarded: number, reason: string} OR number (for backward compat)
 * @param {number} params.savingsCents - Money saved by buyer (this purchase)
 * @param {number} params.totalEarningsCents - Total earnings so far (in cents)
 * @param {number} params.totalPoints - Total points so far
 * @param {number} params.totalSavingsCents - Total money saved by all friends
 * @returns {Object} { subject, text, html }
 */
function buildReferrerCommissionEmail({ referrerEmail, referrerCode, buyerName, product, commissionCents, pointsAwarded = 1000, savingsCents = 0, totalEarningsCents = 0, totalPoints = 0, totalSavingsCents = 0 }) {
  // Handle both new format (object) and old format (number) for backward compatibility
  const awardResult = typeof pointsAwarded === 'object' && pointsAwarded !== null 
    ? pointsAwarded 
    : { awarded: pointsAwarded || 0, reason: 'awarded' };
  const pointsEarned = awardResult.awarded;
  const commissionDollars = (commissionCents / 100).toFixed(2);
  const savingsDollars = (savingsCents / 100).toFixed(2);
  const totalEarningsDollars = (totalEarningsCents / 100).toFixed(2);
  const totalSavingsDollars = (totalSavingsCents / 100).toFixed(2);
  const productName = {
    paperback: 'Paperback',
    ebook: 'eBook',
    audio_preorder: 'Audio Book (Preorder)',
  }[product] || 'Product';
  
  const buyerDisplayName = buyerName || 'someone';
  
  const subject = pointsEarned > 0 
    ? `${buyerDisplayName} purchased The Agnes Protocol (${productName})`
    : `Your friend purchased — here's what happened`;
  
  // Build points messaging based on award result
  let pointsSectionText = '';
  let pointsSectionHtml = '';
  
  if (pointsEarned > 0) {
    // Points were awarded
    pointsSectionText = `You earned:
- $${commissionDollars} commission
- ${pointsEarned} contest points

You just saved ${buyerDisplayName} $${savingsDollars}!`;
    
    pointsSectionHtml = `
              <div style="background-color:#f0f9ff;border-left:4px solid #00ff7f;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">You earned:</h2>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>$${commissionDollars}</strong> commission
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>${pointsEarned}</strong> contest points
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>You just saved ${buyerDisplayName} $${savingsDollars}!</strong>
                </p>
              </div>`;
  } else {
    // Points were NOT awarded - explain why
    let reasonText = '';
    let optimizationTip = '';
    
    if (awardResult.reason === 'same_day') {
      reasonText = `You earned 1,000 contest points for this referral today. Your friend purchased more than one catalog item today, and the contest awards referral points once per day per friend.`;
      optimizationTip = `If your friend buys one item today and another on a different day, you'll earn 1,000 points for each day — which can add up to the full referral maximum.`;
    } else if (awardResult.reason === 'same_sku') {
      reasonText = `No additional contest points were awarded for this purchase. That's because this referral has already earned points for this catalog item (the contest only awards referral points for up to three different catalog items).`;
      optimizationTip = `The best way to earn more referral points is to refer a new friend, or encourage your friend to purchase a different catalog item on a different day (if they haven't hit the referral maximum yet).`;
    } else if (awardResult.reason === 'max_3_reached') {
      reasonText = `No additional contest points were awarded for this purchase. That's because this referral has already earned the maximum points for this friend (the contest only awards referral points for up to three catalog items, on separate days).`;
      optimizationTip = `The best way to earn more referral points is to refer a new friend.`;
    } else if (awardResult.reason === 'no_referred_user') {
      reasonText = `No contest points were awarded because we couldn't identify the buyer.`;
      optimizationTip = `Make sure your friend uses your referral link when purchasing.`;
    } else {
      reasonText = `No additional contest points were awarded for this purchase.`;
      optimizationTip = `Referral points are awarded for up to three different catalog items purchased by the same friend on separate days.`;
    }
    
    pointsSectionText = `🎉 Your friend just made a purchase — nice work.

No additional contest points were awarded for this purchase.

${reasonText}

How to maximize points next time:
${optimizationTip}

Nothing is broken — this is exactly how the contest is designed to reward steady participation over time.

Thanks for helping us test the system — you now have an edge when the real contest begins.`;
    
    pointsSectionHtml = `
              <div style="background-color:#fff3cd;border-left:4px solid #ffc107;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">🎉 Your friend just made a purchase — nice work.</h2>
                <p style="margin:0 0 15px 0;font-size:16px;line-height:1.6;color:#333333;">
                  No additional contest points were awarded for this purchase.
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
                  Nothing is broken — this is exactly how the contest is designed to reward steady participation over time.
                </p>
                <p style="margin:10px 0 0 0;font-size:13px;line-height:1.6;color:#666666;">
                  Thanks for helping us test the system — you now have an edge when the real contest begins.
                </p>
              </div>`;
  }
  
  const text = `
${pointsEarned > 0 ? 'Great news!' : '🎉 Your friend just made a purchase — nice work.'}

${buyerDisplayName} just purchased The Agnes Protocol ${productName} using your referral code.

${pointsSectionText}

${pointsEarned > 0 ? `You just saved ${buyerDisplayName} $${savingsDollars}!

Your new totals:
- Total earnings: $${totalEarningsDollars}
- Total points: ${totalPoints}
- Total you've saved friends: $${totalSavingsDollars}

Keep going — you're on pace! Keep sharing your referral link to earn more rewards.` : ''}

Your referral code: ${referrerCode}

Thank you for spreading the word about The Agnes Protocol.

—Vector 🛰️
DeepQuill LLC
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Referral Commission</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:40px 30px;">
              <h1 style="margin:0 0 20px 0;font-size:24px;color:#0a0a0a;">${pointsEarned > 0 ? 'Great news! 🎉' : '🎉 Your friend just made a purchase — nice work.'}</h1>
              
              <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#333333;">
                <strong>${buyerDisplayName}</strong> just purchased <strong>The Agnes Protocol ${productName}</strong> using your referral code.
              </p>
              
              ${pointsSectionHtml}
              
              ${pointsEarned > 0 ? `
              <div style="background-color:#f9f9f9;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">Your new totals:</h2>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>Total earnings:</strong> $${totalEarningsDollars}
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>Total points:</strong> ${totalPoints}
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>Total you've saved friends:</strong> $${totalSavingsDollars}
                </p>
              </div>
              
              <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#333333;">
                <strong>Keep going — you're on pace!</strong> Keep sharing your referral link to earn more rewards.
              </p>
              ` : ''}
              
              <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                Your referral code: <strong>${referrerCode}</strong>
              </p>
              
              <p style="margin:30px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                Thank you for spreading the word about The Agnes Protocol.
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
  buildReferrerCommissionEmail,
};

