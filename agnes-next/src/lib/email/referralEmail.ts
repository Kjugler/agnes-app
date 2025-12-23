// agnes-next/src/lib/email/referralEmail.ts

import mailchimp from '@mailchimp/mailchimp_transactional';
import { type ReferVideoId } from '@/config/referVideos';
import { applyGlobalEmailBanner } from '@/lib/emailBanner';

type SendReferralEmailParams = {
  toEmail: string;
  referrerEmail?: string; // Used for Reply-To
  referrerName?: string | null; // Optional: referrer's full name for personalization
  referralUrl: string;
  thumbnailUrl: string;
  videoLabel: string;
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
    thumbnailUrl,
    videoLabel,
    referrerEmail,
    referrerName,
  } = params;

  // Compute display name with fallback
  const baseName =
    referrerName && referrerName.trim().length > 0
      ? referrerName.trim()
      : 'Your friend';

  const fromName = `${baseName} via The Agnes Protocol`;

  const baseSubject = "You've Got to Read This Book!";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Hey there,</p>
        <p>${baseName} is part of the launch team for a new book called <strong>"The Agnes Protocol."</strong></p>
        <p>If you decide to grab a copy, this link gives you <strong>$3.90 off</strong> the regular price:</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="${referralUrl}" style="display: inline-block;">
            <img
              src="${thumbnailUrl}"
              alt="${videoLabel}"
              style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
            />
          </a>
        </p>
        <p style="text-align: center;">
          <a href="${referralUrl}" style="display: inline-block; padding: 12px 24px; background-color: #9333ea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Your discount link: Save $3.90
          </a>
        </p>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          Or click here: <a href="${referralUrl}" style="color: #9333ea;">${referralUrl}</a>
        </p>
        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          Every time someone uses my link, I earn $2—and you still get the full discount.
        </p>
        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          Most people who buy do it in the first four months, so if you're curious, don't wait too long.
        </p>
        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          Either way, thanks for checking it out.
        </p>
        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          — ${baseName}
        </p>
      </body>
    </html>
  `;

  const textBody = `Hey there,

${baseName} is part of the launch team for a new book called "The Agnes Protocol."

If you decide to grab a copy, this link gives you $3.90 off the regular price:

Your discount link:
${referralUrl}

Every time someone uses my link, I earn $2—and you still get the full discount.

Most people who buy do it in the first four months, so if you're curious, don't wait too long.

Either way, thanks for checking it out.

— ${baseName}`;

  // Apply global email banner if enabled (includes subject modification)
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
    // Don't throw - allow the API to continue even if email fails
  }
}

