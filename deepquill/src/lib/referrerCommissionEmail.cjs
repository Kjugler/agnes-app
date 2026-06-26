// deepquill/src/lib/referrerCommissionEmail.cjs
// Email template for referrer commission notification

const { formatUsdFromCents } = require('../../lib/formatUsdFromCents.cjs');

/**
 * Build referrer commission email
 *
 * @param {Object} params
 * @param {string} params.referrerEmail - Referrer's email
 * @param {string} params.referrerCode - Referrer's code
 * @param {string} params.buyerName - Buyer's name (e.g., "Gus")
 * @param {string} params.product - Product purchased (paperback, ebook, audio_preorder)
 * @param {number} params.commissionCents - Commission amount in cents
 * @param {Object|number} params.pointsAwarded - Backend only (award result); not shown in copy
 * @param {number} params.savingsCents - Money saved by buyer (this purchase)
 * @param {number} params.totalEarningsCents - Total earnings so far (in cents)
 * @param {number} params.totalPoints - Backend only; not shown in copy
 * @param {number} params.totalSavingsCents - Total money saved by all friends
 * @returns {Object} { subject, text, html }
 */
function buildReferrerCommissionEmail({
  referrerEmail: _referrerEmail,
  referrerCode,
  buyerName,
  product,
  commissionCents,
  pointsAwarded = 1000,
  savingsCents = 0,
  totalEarningsCents = 0,
  totalPoints: _totalPoints = 0,
  totalSavingsCents = 0,
}) {
  const awardResult =
    typeof pointsAwarded === 'object' && pointsAwarded !== null
      ? pointsAwarded
      : { awarded: pointsAwarded || 0, reason: 'awarded' };
  const referralRecognitionRecorded = awardResult.awarded > 0;

  const commissionDollars = formatUsdFromCents(commissionCents).replace('$', '');
  const savingsDollars = formatUsdFromCents(savingsCents).replace('$', '');
  const totalEarningsDollars = formatUsdFromCents(totalEarningsCents).replace('$', '');
  const totalSavingsDollars = formatUsdFromCents(totalSavingsCents).replace('$', '');

  let productLabel = 'Unknown product';
  let productWarning = '';
  if (!product || typeof product !== 'string') {
    productWarning = 'Product attribution missing for this sale. Please review if anything looks off.';
    console.warn('[AP_EMAIL] Missing product in email template', { product, referrerCode });
  } else {
    const productNameMap = {
      paperback: 'Paperback',
      ebook: 'eBook',
      audio_preorder: 'Audio Book (Preorder)',
    };
    productLabel = productNameMap[product] || product;
  }

  const buyerDisplayName = buyerName || 'someone';

  const subject = referralRecognitionRecorded
    ? 'Another reader discovered the book through you'
    : 'Your friend purchased — here is what happened';

  let rewardSectionText = '';
  let rewardSectionHtml = '';

  if (referralRecognitionRecorded) {
    rewardSectionText = `You earned:
- $${commissionDollars} commission

Thanks for helping introduce another reader to The Agnes Protocol.

You just saved ${buyerDisplayName} $${savingsDollars}!`;

    rewardSectionHtml = `
              <div style="background-color:#f0f9ff;border-left:4px solid #00ff7f;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">You earned:</h2>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>$${commissionDollars}</strong> commission
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  Thanks for helping introduce another reader to <em>The Agnes Protocol</em>.
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>You just saved ${buyerDisplayName} $${savingsDollars}!</strong>
                </p>
              </div>`;
  } else {
    let reasonText = '';
    let tipText = '';

    if (awardResult.reason === 'same_day') {
      reasonText =
        'Your referral was recorded for today. When a friend buys more than one item the same day, referral recognition applies once per day per friend.';
      tipText =
        'If your friend buys on separate days, each qualifying purchase can count toward your referral rewards.';
    } else if (awardResult.reason === 'same_sku') {
      reasonText =
        'No additional referral recognition was added for this purchase because this catalog item was already credited for this friend.';
      tipText =
        'Refer a new friend, or encourage them to try a different format of the book on another day.';
    } else if (awardResult.reason === 'max_3_reached') {
      reasonText =
        'This friend has reached the referral recognition limit for catalog items.';
      tipText = 'The best way to grow your impact is to refer someone new to the book.';
    } else if (awardResult.reason === 'no_referred_user') {
      reasonText = 'We could not match this purchase to a referred reader.';
      tipText = 'Ask your friend to use your referral link when they check out.';
    } else {
      reasonText = 'No additional referral recognition was added for this purchase.';
      tipText =
        'Referral rewards apply for up to three different catalog items purchased by the same friend on separate days.';
    }

    rewardSectionText = `Your friend just made a purchase — nice work.

Your recommendation helped another reader discover the book.

${reasonText}

Tip for next time:
${tipText}

Nothing is wrong with your link — these limits keep referral rewards fair for everyone.`;

    rewardSectionHtml = `
              <div style="background-color:#fff3cd;border-left:4px solid #ffc107;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">Your friend just made a purchase — nice work.</h2>
                <p style="margin:0 0 15px 0;font-size:16px;line-height:1.6;color:#333333;">
                  Your recommendation helped another reader discover the book.
                </p>
                <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#333333;">
                  ${reasonText}
                </p>
                <div style="background-color:#f9f9f9;border-radius:4px;padding:15px;margin:15px 0 0 0;">
                  <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#0a0a0a;">
                    <strong>Tip for next time:</strong>
                  </p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#333333;">
                    ${tipText}
                  </p>
                </div>
                <p style="margin:15px 0 0 0;font-size:13px;line-height:1.6;color:#666666;">
                  Nothing is wrong with your link — these limits keep referral rewards fair for everyone.
                </p>
              </div>`;
  }

  const text = `
${productWarning ? `${productWarning}\n\n` : ''}${referralRecognitionRecorded ? 'Great news!' : 'Your friend just made a purchase — nice work.'}

${buyerDisplayName} just purchased The Agnes Protocol ${productLabel} using your referral code.

${rewardSectionText}

${
  referralRecognitionRecorded
    ? `Your new totals:
- Total earnings: $${totalEarningsDollars}
- Total you've saved friends: $${totalSavingsDollars}

Keep sharing your link — readers are discovering the book because of you.`
    : ''
}

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
              <h1 style="margin:0 0 20px 0;font-size:24px;color:#0a0a0a;">${referralRecognitionRecorded ? 'Great news!' : 'Your friend just made a purchase — nice work.'}</h1>
              
              ${productWarning ? `<div style="background-color:#fff3cd;border-left:4px solid #ffc107;border-radius:6px;padding:15px;margin:0 0 20px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#856404;">
                  ${productWarning}
                </p>
              </div>` : ''}
              
              <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#333333;">
                <strong>${buyerDisplayName}</strong> just purchased <strong>The Agnes Protocol ${productLabel}</strong> using your referral code.
              </p>
              
              ${rewardSectionHtml}
              
              ${
                referralRecognitionRecorded
                  ? `
              <div style="background-color:#f9f9f9;border-radius:6px;padding:20px;margin:20px 0;">
                <h2 style="margin:0 0 15px 0;font-size:18px;color:#0a0a0a;">Your new totals:</h2>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>Total earnings:</strong> $${totalEarningsDollars}
                </p>
                <p style="margin:8px 0;font-size:16px;line-height:1.6;color:#333333;">
                  <strong>Total you've saved friends:</strong> $${totalSavingsDollars}
                </p>
              </div>
              
              <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#333333;">
                Keep sharing your link — readers are discovering the book because of you.
              </p>
              `
                  : ''
              }
              
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
