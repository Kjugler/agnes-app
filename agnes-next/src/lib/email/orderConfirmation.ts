// agnes-next/src/lib/email/orderConfirmation.ts

import mailchimp from '@mailchimp/mailchimp_transactional';

type OrderConfirmationParams = {
  to: string;
  orderId: string;
  sessionId: string;
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPostalCode?: string | null;
  shippingCountry?: string | null;
  amountTotalCents: number;
  currency: string;
};

function getClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn(
      '[email] MAILCHIMP_TRANSACTIONAL_KEY missing – order confirmation email will not be sent.'
    );
    return null;
  }

  return mailchimp(apiKey);
}

function formatMoney(cents: number, currency: string) {
  const amount = (cents || 0) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

export async function sendOrderConfirmationEmail(
  params: OrderConfirmationParams
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      '[email] MAILCHIMP_FROM_EMAIL missing – order confirmation email will not be sent.'
    );
    return;
  }

  const {
    to,
    orderId,
    sessionId,
    shippingName,
    shippingPhone,
    shippingAddressLine1,
    shippingAddressLine2,
    shippingCity,
    shippingState,
    shippingPostalCode,
    shippingCountry,
    amountTotalCents,
    currency,
  } = params;

  const displayName = shippingName || to;
  const formattedTotal = formatMoney(amountTotalCents, currency);

  const addressLines: string[] = [];
  if (shippingAddressLine1) addressLines.push(shippingAddressLine1);
  if (shippingAddressLine2) addressLines.push(shippingAddressLine2);

  const cityLineParts: string[] = [];
  if (shippingCity) cityLineParts.push(shippingCity);
  if (shippingState) cityLineParts.push(shippingState);
  if (shippingPostalCode) cityLineParts.push(shippingPostalCode);
  const cityLine = cityLineParts.join(', ');

  const countryLine = shippingCountry || '';

  const textAddress = [addressLines.join(', '), cityLine, countryLine]
    .filter(Boolean)
    .join('\n');

  const textBody = [
    `Hi ${displayName},`,
    '',
    `Thank you for ordering *The Agnes Protocol*. Your order has been received and will ship within 1–2 business days.`,
    '',
    `Order summary:`,
    `- Order ID: ${orderId}`,
    `- Stripe Session: ${sessionId}`,
    `- Total: ${formattedTotal}`,
    '',
    `Shipping to:`,
    textAddress || '(no shipping address on file)',
    '',
    shippingPhone ? `Phone: ${shippingPhone}` : '',
    '',
    `If anything looks incorrect, just reply to this email and we'll take care of it.`,
    '',
    `Thank you for supporting DeepQuill and *The Agnes Protocol*.`,
    '',
    `— DeepQuill`,
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827;">
    <p>Hi ${displayName},</p>
    <p>
      Thank you for ordering <em>The Agnes Protocol</em>. Your order has been received
      and will ship within <strong>1–2 business days</strong>.
    </p>

    <h3 style="margin-top: 24px; margin-bottom: 8px;">Order summary</h3>
    <ul style="margin: 0 0 16px 20px; padding: 0;">
      <li><strong>Order ID:</strong> ${orderId}</li>
      <li><strong>Stripe Session:</strong> ${sessionId}</li>
      <li><strong>Total:</strong> ${formattedTotal}</li>
    </ul>

    <h3 style="margin-top: 16px; margin-bottom: 8px;">Shipping to</h3>
    <p style="white-space: pre-line; margin: 0 0 8px 0;">
      ${textAddress || '(no shipping address on file)'}
    </p>
    ${
      shippingPhone
        ? `<p style="margin: 0 0 16px 0;"><strong>Phone:</strong> ${shippingPhone}</p>`
        : ''
    }

    <p style="margin-top: 16px;">
      If anything looks incorrect, just reply to this email and we'll take care of it.
    </p>

    <p style="margin-top: 24px;">
      Thank you for supporting DeepQuill and <em>The Agnes Protocol</em>.
    </p>

    <p>— DeepQuill</p>
  </div>
  `;

  const toList: { email: string; type: 'to' | 'bcc'; name?: string }[] = [
    { email: to, type: 'to', name: displayName },
  ];

  const alertEmail = process.env.ORDER_ALERT_EMAIL;
  if (alertEmail) {
    toList.push({ email: alertEmail, type: 'bcc', name: 'DeepQuill Orders' });
  }

  try {
    console.log('[email] Sending order confirmation email', {
      to,
      orderId,
      sessionId,
    });

    await client.messages.send({
      message: {
        from_email: fromEmail,
        subject: 'Your order has been received – The Agnes Protocol',
        to: toList,
        text: textBody,
        html: htmlBody,
      },
    });

    console.log('[email] Order confirmation email sent', {
      to,
      orderId,
    });
  } catch (err) {
    console.error('[email] Error sending order confirmation email', {
      error: err,
      to,
      orderId,
    });
  }
}

