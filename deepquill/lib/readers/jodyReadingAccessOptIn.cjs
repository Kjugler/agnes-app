/**
 * Explicit promotional opt-in from Jody's reading-access form.
 * An unchecked box never reaches this planner. An email address alone is not consent.
 * Does not send mail and does not grant reading access.
 */

const { promotionalConsentState } = require('./promotionalConsent.cjs');

function planJodyReadingAccessOptIn({ profile, doNotContact, archived, explicit, accept } = {}) {
  if (explicit !== true || accept !== true) {
    return { write: false, error: 'explicit_confirmation_required' };
  }
  if (doNotContact === true || archived === true) {
    return { write: false, error: 'suppressed' };
  }
  const state = promotionalConsentState(profile);
  if (state.optOutAt && !state.active) {
    return { write: false, error: 'opt_out_preserved', state };
  }
  if (state.active) {
    return { write: false, error: 'already_active', state };
  }
  return { write: true, action: 'opt_in', source: 'jody-reading-access' };
}

module.exports = {
  planJodyReadingAccessOptIn,
};
