// Reader Recommendation Outreach — ask readers to recommend via Text-a-Friend.

const { getSiteUrl } = require('../../readers/readerUrls.cjs');
const {
  TEMPLATE_BATCH_1,
  TEMPLATE_CURRENT,
} = require('../readerRecommendationOutreachConfig.cjs');

const SUBJECT_BATCH_1 = 'Would you do me a small favor?';
const SUBJECT_CURRENT = 'Someone you know would love The Agnes Protocol';
const CTA_LABEL = 'Recommend The Agnes Protocol';
const COVER_PATH = '/og/book-cover-og.jpg';
const COVER_WIDTH_PX = 170;

const FORWARD_INSTRUCTION =
  "Please don't forward this email. Click the green button below instead. It opens a text message you can edit before sending, your friend receives 15% off automatically, and we can properly thank you for introducing another reader.";

function buildComplianceFooter() {
  return 'You are receiving this email because you are a reader of The Agnes Protocol. Reply to this email to opt out.';
}

function resolveSubject(templateId) {
  return templateId === TEMPLATE_BATCH_1 ? SUBJECT_BATCH_1 : SUBJECT_CURRENT;
}

function buildReaderRecommendationOutreachEmail({
  firstName,
  textAFriendUrl,
  siteUrl,
  template = TEMPLATE_CURRENT,
}) {
  const name = (firstName && String(firstName).trim()) || 'friend';
  const footer = buildComplianceFooter();
  const base = (siteUrl || getSiteUrl()).replace(/\/$/, '');
  const coverImageUrl = `${base}${COVER_PATH}`;
  const subject = resolveSubject(template);
  const includeForwardInstruction = template !== TEMPLATE_BATCH_1;

  const textLines = [`Hi ${name},`, ''];
  if (includeForwardInstruction) {
    textLines.push(FORWARD_INSTRUCTION, '');
  }
  textLines.push(
    "I'm so glad you enjoyed reading The Agnes Protocol.",
    '',
    'If you think someone you know would enjoy the story, would you recommend it to just one friend?',
    '',
    "If they decide to purchase the book using your recommendation, they'll automatically receive 15% off.",
    '',
    "We built a simple button that opens a text message for you. You can choose who to send it to, edit the message if you'd like, or decide not to send it at all.",
    '',
    `${CTA_LABEL}: ${textAFriendUrl}`,
    '',
    'Thank you for helping other readers discover the story.',
    '',
    '— Kris Jugler',
    '(Simon McQuade)',
    '',
    footer,
  );

  const text = textLines.join('\n');

  const forwardHtml = includeForwardInstruction
    ? `<p style="margin:0 0 16px 0;">${FORWARD_INSTRUCTION}</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#fafafa;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#fafafa;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e5e5;">
          <tr>
            <td align="center" style="padding:28px 28px 8px 28px;">
              <img
                src="${coverImageUrl}"
                alt="The Agnes Protocol book cover"
                width="${COVER_WIDTH_PX}"
                style="display:block;width:${COVER_WIDTH_PX}px;max-width:100%;height:auto;border-radius:4px;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px 28px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#222222;font-size:16px;line-height:1.6;">
              <p style="margin:0 0 16px 0;">Hi ${name},</p>
              ${forwardHtml}
              <p style="margin:0 0 16px 0;">I'm so glad you enjoyed reading <em>The Agnes Protocol</em>.</p>
              <p style="margin:0 0 16px 0;">If you think someone you know would enjoy the story, would you recommend it to just one friend?</p>
              <p style="margin:0 0 16px 0;">If they decide to purchase the book using your recommendation, they'll automatically receive 15% off.</p>
              <p style="margin:0 0 24px 0;">We built a simple button that opens a text message for you. You can choose who to send it to, edit the message if you'd like, or decide not to send it at all.</p>
              <p style="margin:0 0 28px 0;text-align:center;">
                <a href="${textAFriendUrl}" style="display:inline-block;padding:14px 24px;background-color:#00ff7f;color:#0a0a0a;text-decoration:none;font-size:16px;font-weight:700;border-radius:8px;">${CTA_LABEL}</a>
              </p>
              <p style="margin:0 0 24px 0;">Thank you for helping other readers discover the story.</p>
              <p style="margin:0;font-size:15px;line-height:1.5;color:#222222;">
                — Kris Jugler<br />
                <span style="color:#555555;">(Simon McQuade)</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px 28px;border-top:1px solid #e5e5e5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.5;color:#555555;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html, text };
}

module.exports = {
  buildReaderRecommendationOutreachEmail,
  SUBJECT_BATCH_1,
  SUBJECT_CURRENT,
  CTA_LABEL,
  FORWARD_INSTRUCTION,
};
