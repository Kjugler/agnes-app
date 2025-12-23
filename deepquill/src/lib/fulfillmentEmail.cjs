// deepquill/src/lib/fulfillmentEmail.cjs
// Email template for eBook fulfillment

const envConfig = require('../config/env.cjs');

/**
 * Build eBook fulfillment email
 * 
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {string} params.downloadUrl - Secure download URL
 * @param {number} params.ttlDays - Link expiry in days
 * @returns {Object} { subject, text, html }
 */
function buildEbookFulfillmentEmail({ email, downloadUrl, ttlDays = 7 }) {
  const subject = 'Your free Agnes Protocol eBook is ready';
  
  const text = `
Thank you for purchasing The Agnes Protocol paperback!

As promised, your free eBook is ready to download.

Download your eBook: ${downloadUrl}

This link will expire in ${ttlDays} days. If you need a new link, please contact us at hello@theagnesprotocol.com.

Thank you for being part of The Agnes Protocol community.

—Vector 🛰️
DeepQuill LLC
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your free eBook is ready</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:40px 30px;">
              <h1 style="margin:0 0 20px 0;font-size:24px;color:#0a0a0a;">Your free eBook is ready</h1>
              
              <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#333333;">
                Thank you for purchasing <strong>The Agnes Protocol</strong> paperback!
              </p>
              
              <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#333333;">
                As promised, your free eBook is ready to download.
              </p>
              
              <div style="margin:30px 0;text-align:center;">
                <a href="${downloadUrl}" style="display:inline-block;padding:14px 28px;background-color:#00ff7f;color:#000000;text-decoration:none;font-size:16px;font-weight:bold;border-radius:4px;">
                  Download Your eBook
                </a>
              </div>
              
              <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                <strong>Important:</strong> This download link will expire in ${ttlDays} days.
              </p>
              
              <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                If you need a new link or have any questions, please contact us at 
                <a href="mailto:hello@theagnesprotocol.com" style="color:#00ff7f;">hello@theagnesprotocol.com</a>.
              </p>
              
              <p style="margin:30px 0 0 0;font-size:14px;line-height:1.6;color:#666666;">
                Thank you for being part of The Agnes Protocol community.
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
  buildEbookFulfillmentEmail,
};

