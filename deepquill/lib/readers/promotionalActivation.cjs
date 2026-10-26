/**
 * Master switch for system-initiated promotional mail.
 * Unset or any value other than "1" keeps every promotional job off.
 * Jody nurturing also requires NURTURE_PROMOTIONAL_SENDING=1.
 * Purchase receipts and user-initiated referral messages do not read this.
 */

function masterPromotionalSendingEnabled(env = process.env) {
  return String(env.PROMOTIONAL_SENDING_ENABLED || '') === '1';
}

function promotionalPostalAddress(env = process.env) {
  const value = String(env.PROMOTIONAL_POSTAL_ADDRESS || '').trim();
  return value || null;
}

function promotionalDeliveryGate(env = process.env) {
  if (!masterPromotionalSendingEnabled(env)) {
    return { blocked: true, reason: 'promotional_sending_disabled', postalAddress: null };
  }
  const postalAddress = promotionalPostalAddress(env);
  if (!postalAddress) {
    return { blocked: true, reason: 'postal_address_required', postalAddress: null };
  }
  return { blocked: false, reason: null, postalAddress };
}

module.exports = {
  masterPromotionalSendingEnabled,
  promotionalPostalAddress,
  promotionalDeliveryGate,
};
