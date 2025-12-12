import { type ReferVideoId } from '@/config/referVideos';

export interface SendReferralEmailParams {
  friendEmail: string;
  referrerCode: string;
  referralUrl: string;
  videoId: ReferVideoId;
  videoLabel: string;
  thumbnailUrl: string;
  referrerEmail?: string; // Used for Reply-To
  referrerFirstName?: string; // Optional: referrer's first name for personalization
}

export async function sendReferralEmail(
  params: SendReferralEmailParams
): Promise<void> {
  const {
    friendEmail,
    referralUrl,
    videoLabel,
    thumbnailUrl,
    referrerEmail,
    referrerFirstName,
  } = params;

  // Check if email service is configured
  const smtpHost = process.env.HELP_SMTP_HOST;
  const smtpUser = process.env.HELP_SMTP_USER;
  const smtpPass = process.env.HELP_SMTP_PASS;
  const smtpPort = Number(process.env.HELP_SMTP_PORT ?? 587);
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL || smtpUser || 'hello@theagnesprotocol.com';
  const fromName =
    referrerEmail != null && referrerEmail.length > 0
      ? 'Your friend via The Agnes Protocol'
      : process.env.MAILCHIMP_FROM_NAME || 'The Agnes Protocol';

  // Email content
  const subject = 'I found a wild book you need to see';

  // Use provided firstName, or extract from email, or fallback
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
        <p>Hey there,</p>
        <p>I'm part of the launch team for a new book called <strong>"The Agnes Protocol."</strong></p>
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
          — ${displayFirstName}
        </p>
      </body>
    </html>
  `;

  const textBody = `Hey there,

I'm part of the launch team for a new book called "The Agnes Protocol."

If you decide to grab a copy, this link gives you $3.90 off the regular price:

Your discount link:
${referralUrl}

Every time someone uses my link, I earn $2—and you still get the full discount.

Most people who buy do it in the first four months, so if you're curious, don't wait too long.

Either way, thanks for checking it out.

— ${displayFirstName}`;

  // Debug logging (dev only)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[REFERRAL_EMAIL] Sending referral to', friendEmail, 'via', fromEmail);
    if (referrerEmail) {
      console.log('[REFERRAL_EMAIL] Reply-To:', referrerEmail);
    }
  }

  // If SMTP is configured, send via nodemailer (same transport as Help email)
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import('nodemailer');
      // Use the same SMTP transport configuration as Help email
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
        subject,
        text: textBody,
        html: htmlBody,
        ...(referrerEmail
          ? { replyTo: referrerEmail }
          : {}), // only set Reply-To if provided
      });

      console.log('[Referral Email] Sent successfully to', friendEmail);
    } catch (error) {
      console.error('[Referral Email] Error sending email:', error);
      throw new Error('Failed to send referral email');
    }
  } else {
    // Development mode: log instead of sending
    console.log('[Referral Email] SMTP not configured. Would send:');
    console.log('To:', friendEmail);
    console.log('Subject:', subject);
    console.log('Referral URL:', referralUrl);
    console.log('Thumbnail:', thumbnailUrl);
    // In production, you might want to throw an error here
    // throw new Error('Email service not configured');
  }
}

