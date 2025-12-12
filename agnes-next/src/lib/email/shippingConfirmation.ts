// agnes-next/src/lib/email/shippingConfirmation.ts

import mailchimp from '@mailchimp/mailchimp_transactional';

type ShippingEmailParams = {
  toEmail: string;
  shippingName: string;
  orderId: string;
};

function getClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn(
      '[email] MAILCHIMP_TRANSACTIONAL_KEY missing – shipping confirmation email will not be sent.'
    );
    return null;
  }

  return mailchimp(apiKey);
}

export async function sendShippingConfirmationEmail(
  params: ShippingEmailParams
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      '[email] MAILCHIMP_FROM_EMAIL missing – shipping confirmation email will not be sent.'
    );
    return;
  }

  const { toEmail, shippingName, orderId } = params;

  const textBody = [
    `Hi ${shippingName},`,
    ``,
    `Good news — your copy of *The Agnes Protocol* is now on its way.`,
    ``,
    `We've processed your shipment and handed it off to the carrier. Most readers receive their book within 5–10 business days.`,
    ``,
    `Order ID: ${orderId}`,
    ``,
    `Thank you again for being part of this launch.`,
    ``,
    `— DeepQuill`,
  ].join('\n');

  const htmlBody = `
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
    <p>Hi ${shippingName},</p>
    <p>
      Good news — your copy of <em>The Agnes Protocol</em> is now on its way.
    </p>
    <p>
      We've processed your shipment and handed it off to the carrier. Most readers receive their book within <strong>5–10 business days</strong>.
    </p>
    <p style="margin-top: 16px;">
      <strong>Order ID:</strong> ${orderId}
    </p>
    <p style="margin-top: 24px;">
      Thank you again for being part of this launch.
    </p>
    <p>— DeepQuill</p>
  </div>
  `;

  const toList: { email: string; type: 'to' | 'bcc'; name?: string }[] = [
    { email: toEmail, type: 'to', name: shippingName },
  ];

  const alertEmail = process.env.ORDER_ALERT_EMAIL;
  if (alertEmail) {
    toList.push({ email: alertEmail, type: 'bcc', name: 'DeepQuill Orders' });
  }

  try {
    console.log('[email] Sending shipping confirmation email', {
      toEmail,
      orderId,
    });

    await client.messages.send({
      message: {
        from_email: fromEmail,
        subject: 'Your copy of *The Agnes Protocol* is on its way',
        to: toList,
        text: textBody,
        html: htmlBody,
      },
    });

    console.log('[email] Shipping confirmation email sent', {
      toEmail,
      orderId,
    });
  } catch (err) {
    console.error('[email] Error sending shipping confirmation email', {
      error: err,
      toEmail,
      orderId,
    });
  }
}

