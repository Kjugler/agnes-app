import { SAMPLE_CHAPTERS_OG_IMAGE_URL } from '@/lib/textAFriendOg';
import { applyGlobalEmailBanner } from '@/lib/emailBanner';

export interface SendReferralEmailParams {
  friendEmail: string;
  referrerCode: string;
  referralUrl: string;
  thumbnailUrl?: string;
  referrerEmail?: string; // Used for Reply-To
  referrerFirstName?: string; // Optional: referrer's first name for personalization
}

export async function sendReferralEmail(
  params: SendReferralEmailParams
): Promise<void> {
  const {
    friendEmail,
    referralUrl,
    thumbnailUrl = SAMPLE_CHAPTERS_OG_IMAGE_URL,
    referrerEmail,
    referrerFirstName,
  } = params;

  const smtpHost = process.env.HELP_SMTP_HOST;
  const smtpUser = process.env.HELP_SMTP_USER;
  const smtpPass = process.env.HELP_SMTP_PASS;
  const smtpPort = Number(process.env.HELP_SMTP_PORT ?? 587);
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || smtpUser || 'hello@theagnesprotocol.com';
  const fromName =
    referrerEmail != null && referrerEmail.length > 0
      ? 'Your friend via The Agnes Protocol'
      : process.env.MAILCHIMP_FROM_NAME || 'The Agnes Protocol';

  const subject = "You've got to read this.";

  const displayFirstName = referrerFirstName ||
    (referrerEmail ? referrerEmail.split('@')[0].split('.')[0] : null) ||
    'Your friend';

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
        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          — ${displayFirstName}
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

${referralUrl}

— ${displayFirstName}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[REFERRAL_EMAIL] Sending referral to', friendEmail, 'via', fromEmail);
    if (referrerEmail) {
      console.log('[REFERRAL_EMAIL] Reply-To:', referrerEmail);
    }
  }

  const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
    html: htmlBody,
    text: textBody,
    subject,
  });

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: false,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transport.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: friendEmail,
        subject: finalSubject ?? subject,
        text: finalText ?? textBody,
        html: finalHtml ?? htmlBody,
        ...(referrerEmail ? { replyTo: referrerEmail } : {}),
      });

      console.log('[Referral Email] Sent successfully to', friendEmail);
    } catch (error) {
      console.error('[Referral Email] Error sending email:', error);
      throw new Error('Failed to send referral email');
    }
  } else {
    console.log('[Referral Email] SMTP not configured. Would send:');
    console.log('To:', friendEmail);
    console.log('Subject:', subject);
    console.log('Referral URL:', referralUrl);
    console.log('Thumbnail:', thumbnailUrl);
  }
}
