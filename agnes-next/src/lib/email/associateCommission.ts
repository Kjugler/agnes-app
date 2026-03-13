// agnes-next/src/lib/email/associateCommission.ts

import mailchimp from '@mailchimp/mailchimp_transactional';
import { shouldSendTransactionalEmails } from '@/lib/emailConfig';

type AssociateCommissionEmailParams = {
  referrerEmail: string;
  referrerCode: string;
  lastEarningCents: number;
  totalEarnedCents: number;
  totalSavedForFriendsCents: number;
  totalFriendsConverted: number;
  referrerFirstName?: string;
};

function getClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn(
      '[email] MAILCHIMP_TRANSACTIONAL_KEY missing – associate commission email will not be sent.'
    );
    return null;
  }

  return mailchimp(apiKey);
}

function formatCentsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function sendAssociateCommissionEmail(
  params: AssociateCommissionEmailParams
): Promise<void> {
  if (!shouldSendTransactionalEmails()) {
    console.log('[ASSOCIATE_COMMISSION] Skipping email (TRANSACTIONAL_EMAIL_ENABLED not set)');
    return;
  }

  const client = getClient();
  if (!client) {
    console.warn('[ASSOCIATE_COMMISSION] Mailchimp not configured, skipping email');
    return;
  }

  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      '[email] MAILCHIMP_FROM_EMAIL missing – associate commission email will not be sent.'
    );
    return;
  }

  const {
    referrerEmail,
    referrerCode,
    lastEarningCents,
    totalEarnedCents,
    totalSavedForFriendsCents,
    totalFriendsConverted,
    referrerFirstName,
  } = params;

  const firstName = referrerFirstName || referrerEmail.split('@')[0].split('.')[0];
  const lastEarningDollars = formatCentsToDollars(lastEarningCents);
  const totalEarnedDollars = formatCentsToDollars(totalEarnedCents);
  const totalSavedDollars = formatCentsToDollars(totalSavedForFriendsCents);

  // Subject line options (using first one)
  const subject = 'Another sale. Another payday. 💰';

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_SITE_URL or SITE_URL must be set');
    }
    return 'http://localhost:3002';
  })();
  const payoutPreferencesUrl = `${siteUrl}/earnings/preferences`;

  const textBody = [
    `Hi ${firstName},`,
    ``,
    `Good news — your referral code ${referrerCode} was just used to purchase The Agnes Protocol.`,
    ``,
    `🔥 Your Earnings`,
    ``,
    `You earned: $${lastEarningDollars}`,
    `Your running total is now: $${totalEarnedDollars}`,
    ``,
    `📘 Your Impact`,
    ``,
    `Your friends have saved a total of: $${totalSavedDollars}`,
    `Total books purchased from your referrals: ${totalFriendsConverted}`,
    ``,
    `💵 How would you like to receive your payout?`,
    ``,
    `When you're ready, we can send your earnings through:`,
    ``,
    `Venmo`,
    `Direct deposit`,
    `Physical check`,
    ``,
    `Click below to choose:`,
    ``,
    `👉 Update My Payout Method`,
    `${payoutPreferencesUrl}`,
    ``,
    `Thank you for helping spread the truth.`,
    ``,
    `—Vector 🛰️`,
    `DeepQuill LLC`,
  ].join('\n');

  const htmlBody = `
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px;">
    <p>Hi ${firstName},</p>
    <p>
      Good news — your referral code <strong>${referrerCode}</strong> was just used to purchase <em>The Agnes Protocol</em>.
    </p>
    
    <div style="margin-top: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 12px;">🔥 Your Earnings</h2>
      <p>
        You earned: <strong>$${lastEarningDollars}</strong><br/>
        Your running total is now: <strong>$${totalEarnedDollars}</strong>
      </p>
    </div>
    
    <div style="margin-top: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 12px;">📘 Your Impact</h2>
      <p>
        Your friends have saved a total of: <strong>$${totalSavedDollars}</strong><br/>
        Total books purchased from your referrals: <strong>${totalFriendsConverted}</strong>
      </p>
    </div>
    
    <div style="margin-top: 32px;">
      <h2 style="font-size: 18px; margin-bottom: 12px;">💵 How would you like to receive your payout?</h2>
      <p>
        When you're ready, we can send your earnings through:
      </p>
      <ul style="margin-left: 20px; margin-top: 12px;">
        <li>Venmo</li>
        <li>Direct deposit</li>
        <li>Physical check</li>
      </ul>
      <p style="margin-top: 20px;">
        <a href="${payoutPreferencesUrl}" style="display: inline-block; background-color: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          👉 Update My Payout Method
        </a>
      </p>
    </div>
    
    <p style="margin-top: 32px;">
      Thank you for helping spread the truth.
    </p>
    <p style="margin-top: 16px;">
      —Vector 🛰️<br/>
      <strong>DeepQuill LLC</strong>
    </p>
  </div>
  `;

  const toList: { email: string; type: 'to' | 'bcc'; name?: string }[] = [
    { email: referrerEmail, type: 'to', name: firstName },
  ];

  const alertEmail = process.env.ORDER_ALERT_EMAIL;
  if (alertEmail) {
    toList.push({ email: alertEmail, type: 'bcc', name: 'DeepQuill Orders' });
  }

  try {
    console.log('[ASSOCIATE_COMMISSION] Sending commission email', {
      referrerEmail,
      referrerCode,
      lastEarningCents,
      totalEarnedCents,
      totalFriendsConverted,
    });

    // Apply global test contest banner (includes subject prefix)
    const { applyGlobalEmailBanner } = await import('@/lib/emailBanner');
    const { html: htmlWithBanner, text: textWithBanner, subject: finalSubject } = applyGlobalEmailBanner({
      html: htmlBody,
      text: textBody,
      subject,
    });

    await client.messages.send({
      message: {
        from_email: fromEmail,
        subject: finalSubject ?? subject,
        to: toList,
        text: textWithBanner,
        html: htmlWithBanner,
        headers: {
          'Reply-To': process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com',
        },
      },
    });

    console.log('[ASSOCIATE_COMMISSION] Commission email sent successfully', {
      referrerEmail,
      referrerCode,
    });
  } catch (err) {
    console.error('[ASSOCIATE_COMMISSION] Error sending commission email', {
      error: err,
      referrerEmail,
      referrerCode,
    });
    // Don't throw - allow webhook to continue even if email fails
  }
}

