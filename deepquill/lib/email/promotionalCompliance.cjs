/**
 * Sender identification for promotional mail.
 * The postal address comes only from PROMOTIONAL_POSTAL_ADDRESS.
 * This module does not supply a fallback address.
 */

const { promotionalPostalAddress } = require('../readers/promotionalActivation.cjs');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function promotionalListHeaders(oneClickUrl) {
  const url = String(oneClickUrl || '').trim();
  if (!url) return null;
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function appendPromotionalIdentification({ html, text, postalAddress, unsubscribeUrl } = {}) {
  const address = String(postalAddress || '').trim();
  const link = String(unsubscribeUrl || '').trim();
  if (!address || !link) return null;
  const safeAddress = escapeHtml(address);
  const safeLink = escapeHtml(link);
  return {
    html: `${html || ''}<p style="font-size:12px;line-height:1.5;color:#6d675f;">DeepQuill LLC<br />${safeAddress}<br /><a href="${safeLink}">Unsubscribe</a></p>`,
    text: `${text || ''}\n\nDeepQuill LLC\n${address}\nUnsubscribe: ${link}\n`,
  };
}

function requirePromotionalPostalAddress(env = process.env) {
  return promotionalPostalAddress(env);
}

module.exports = {
  promotionalListHeaders,
  appendPromotionalIdentification,
  requirePromotionalPostalAddress,
};
