// agnes-next/src/lib/email/referralEmail.ts

import mailchimp from '@mailchimp/mailchimp_transactional';
import { SAMPLE_CHAPTERS_OG_IMAGE_URL } from '@/lib/textAFriendOg';
import { applyGlobalEmailBanner } from '@/lib/emailBanner';
import { shouldSendTransactionalEmails } from '@/lib/emailConfig';

type SendReferralEmailParams = {
  toEmail: string;
  referrerEmail?: string; // Used for Reply-To
  referrerName?: string | null; // Optional: referrer's full name for personalization
  referralUrl: string;
  thumbnailUrl?: string;
};

function getClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn(
      '[email] MAILCHIMP_TRANSACTIONAL_KEY missing – referral email will not be sent.'
    );
    return null;
  }

  return mailchimp(apiKey);
}

export async function sendReferralEmail(
  params: SendReferralEmailParams
): Promise<void> {
  if (!shouldSendTransactionalEmails()) {
    console.log('[REFERRAL_EMAIL] Skipping email (TRANSACTIONAL_EMAIL_ENABLED not set)');
    return;
  }

  const client = getClient();
  if (!client) {
    console.warn('[REFERRAL_EMAIL] Mailchimp not configured, skipping email');
    return;
  }

  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      '[email] MAILCHIMP_FROM_EMAIL missing – referral email will not be sent.'
    );
    return;
  }

  const {
    toEmail,
    referralUrl,
    thumbnailUrl = SAMPLE_CHAPTERS_OG_IMAGE_URL,
    referrerEmail,
    referrerName,
  } = params;

  const baseName =
    referrerName && referrerName.trim().length > 0
      ? referrerName.trim()
      : 'Your friend';

  const fromName = `${baseName} via The Agnes Protocol`;

  const baseSubject = "You've got to read this.";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>I just finished <em>The Agnes Protocol</em> and immediately thought of you.</p>
        <p>Start with the free sample chapters below.</p>
        <p>If you decide to buy the book, I already got you 15% off.</p>
        <p>The reviews have been outstanding, but don't take anyone else's word for it.</p>
        <p>Read the sample chapters.</p>
        <p>I think you'll understand why readers are recommending this book to their friends.</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="${referralUrl}" style="color: #9333ea;">${referralUrl}</a>
        </p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="${referralUrl}" style="display: inline-block;">
            <img
              src="${thumbnailUrl}"
              alt="Read sample chapters from The Agnes Protocol"
              style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
            />
          </a>
        </p>
      </body>
    </html>
  `;

  const textBody = `I just finished The Agnes Protocol and immediately thought of you.

Start with the free sample chapters below.

If you decide to buy the book, I already got you 15% off.

The reviews have been outstanding, but don't take anyone else's word for it.

Read the sample chapters.

I think you'll understand why readers are recommending this book to their friends.

${referralUrl}`;

  const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
    html: htmlBody,
    text: textBody,
    subject: baseSubject,
  });

  const toList: { email: string; type: 'to' | 'bcc'; name?: string }[] = [
    { email: toEmail, type: 'to' },
  ];

  const alertEmail = process.env.ORDER_ALERT_EMAIL;
  if (alertEmail) {
    toList.push({ email: alertEmail, type: 'bcc', name: 'DeepQuill Orders' });
  }

  try {
    console.log('[REFERRAL_EMAIL] Sending referral email', {
      toEmail,
      fromName,
      referralUrl,
    });

    await client.messages.send({
      message: {
        from_email: fromEmail,
        from_name: fromName,
        subject: finalSubject || baseSubject,
        to: toList,
        text: finalText || textBody,
        html: finalHtml || htmlBody,
        ...(referrerEmail
          ? {
              headers: {
                'Reply-To': referrerEmail,
              },
            }
          : {}),
      },
    });

    console.log('[REFERRAL_EMAIL] Referral email sent successfully', {
      toEmail,
      referralUrl,
    });
  } catch (err) {
    console.error('[REFERRAL_EMAIL] Error sending referral email', {
      error: err,
      toEmail,
      referralUrl,
    });
  }
}
