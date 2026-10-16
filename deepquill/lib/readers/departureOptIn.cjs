/**
 * Explicit promotional opt-in from the departure invitation.
 * Reading access, referral ancestry, and Jody consent are not written here.
 */

const { promotionalConsentState } = require('./promotionalConsent.cjs');

function planDepartureOptIn({ profile, doNotContact, archived, explicit, accept } = {}) {
  if (explicit !== true || accept !== true) {
    return { write: false, error: 'explicit_confirmation_required' };
  }
  if (doNotContact === true || archived === true) {
    return { write: false, error: 'suppressed', decided: true };
  }
  const state = promotionalConsentState(profile);
  if (state.active || state.optOutAt) {
    return { write: false, error: 'already_decided', decided: true, state };
  }
  return { write: true, action: 'opt_in', source: 'departure_bridge' };
}

function departureStatus({ profile, doNotContact, archived, known } = {}) {
  if (!known) {
    return { audience: 'unknown', decided: false, emailHint: null };
  }
  const state = promotionalConsentState(profile);
  const decided = doNotContact === true || archived === true || state.active || Boolean(state.optOutAt);
  return { audience: 'known', decided, emailHint: null };
}

module.exports = {
  planDepartureOptIn,
  departureStatus,
};
