/**
 * Mailchimp Transactional reject check for a future promotional send.
 * Fail closed. Not used by page rendering.
 */

const { normalizeEmail } = require('../../src/lib/normalize.cjs');

function mapRejectReason(reason) {
  const value = String(reason || '').trim().toLowerCase();
  if (value === 'spam' || value === 'complaint') return 'complaint';
  if (value === 'unsub' || value === 'unsubscribe') return 'provider_unsubscribe';
  if (value) return 'provider_reject';
  return 'provider_reject';
}

function unavailable(detail) {
  return {
    checked: false,
    suppressed: true,
    reason: 'provider_check_failed',
    providerReason: detail || null,
  };
}

async function checkTransactionalSuppression(email, deps = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return unavailable('missing_email');

  const apiKey = deps.apiKey != null ? deps.apiKey : process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) return unavailable('missing_key');

  let client = deps.client;
  if (!client) {
    try {
      const mailchimp = require('@mailchimp/mailchimp_transactional');
      client = mailchimp(apiKey);
    } catch (err) {
      return unavailable('client_unavailable');
    }
  }
  if (!client || typeof client.rejects?.list !== 'function') {
    return unavailable('rejects_list_unavailable');
  }

  let rejects;
  try {
    rejects = await client.rejects.list({});
  } catch (err) {
    return unavailable('rejects_list_failed');
  }
  if (!Array.isArray(rejects)) return unavailable('rejects_list_invalid');

  const row = rejects.find((item) => normalizeEmail(item && item.email) === normalized);
  if (!row) {
    return { checked: true, suppressed: false, reason: null, providerReason: null };
  }
  const providerReason = row.reason ? String(row.reason) : null;
  return {
    checked: true,
    suppressed: true,
    reason: mapRejectReason(providerReason),
    providerReason,
  };
}

module.exports = {
  mapRejectReason,
  checkTransactionalSuppression,
};
