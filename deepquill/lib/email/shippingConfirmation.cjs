// deepquill/lib/email/shippingConfirmation.cjs
// Shipping confirmation email - uses sendEmail with contest banner

const { sendEmail } = require('./sendEmail.cjs');

/**
 * Send shipping confirmation email to customer
 * @param {Object} params
 * @param {string} params.toEmail - Customer email
 * @param {string} params.shippingName - Customer/recipient name
 * @param {string} params.orderId - Order ID for reference
 * @returns {Promise<void>}
 */
async function sendShippingConfirmationEmail({ toEmail, shippingName, orderId }) {
  const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
  if (!fromEmail) {
    console.warn('[email] MAILCHIMP_FROM_EMAIL missing – shipping confirmation email will not be sent.');
    return;
  }

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

  const subject = 'Your copy of *The Agnes Protocol* is on its way';

  const toList = [{ email: toEmail, type: 'to', name: shippingName }];
  const alertEmail = process.env.ORDER_ALERT_EMAIL;
  if (alertEmail) {
    toList.push({ email: alertEmail, type: 'bcc', name: 'DeepQuill Orders' });
  }

  try {
    console.log('[email] Sending shipping confirmation email', { toEmail, orderId });

    await sendEmail({
      fromEmail,
      fromName: 'DeepQuill',
      to: toList,
      subject,
      html: htmlBody,
      text: textBody,
    });

    console.log('[email] Shipping confirmation email sent', { toEmail, orderId });
  } catch (err) {
    console.error('[email] Error sending shipping confirmation email', {
      error: err,
      toEmail,
      orderId,
    });
    throw err;
  }
}

module.exports = {
  sendShippingConfirmationEmail,
};
