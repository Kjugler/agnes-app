import { type ReferVideoId } from '@/config/referVideos';

export interface SendReferralEmailParams {
  friendEmail: string;
  referrerCode: string;
  referralUrl: string;
  videoId: ReferVideoId;
  videoLabel: string;
  thumbnailUrl: string;
  referrerEmail?: string; // NEW: used for Reply-To
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
  const subject = 'Your friend invited you to The Agnes Protocol';

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Someone you know invited you to check out <strong>The Agnes Protocol</strong>.</p>
        <p>Watch the short video and learn more about the book:</p>
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
            Watch Video & Learn More
          </a>
        </p>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          Or click here: <a href="${referralUrl}" style="color: #9333ea;">${referralUrl}</a>
        </p>
        <p style="font-size: 14px; color: #666;">
          If you buy the book, your friend will earn a $2 referral reward.
        </p>
      </body>
    </html>
  `;

  const textBody = `A friend shared something with you:

They thought you'd like this video and book: The Agnes Protocol.

Watch the video and learn more here:
${referralUrl}

If you purchase, they'll earn a $2 referral reward.`;

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

