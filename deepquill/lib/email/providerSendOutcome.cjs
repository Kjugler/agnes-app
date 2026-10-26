/**
 * Classify a promotional provider result.
 * Ambiguous outcomes are not retried. A definite nonacceptance may be retried
 * only after a later authorization.
 */

const AMBIGUOUS_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function classifyProviderResult(result) {
  const row = Array.isArray(result) ? result[0] : result;
  const status = String(row && row.status || '').toLowerCase();
  if (status === 'sent' || status === 'queued' || status === 'scheduled') return 'accepted';
  if (status === 'rejected' || status === 'invalid') return 'rejected';
  return 'ambiguous';
}

function classifyProviderFailure(err) {
  const code = String(err && (err.code || err.errno) || '').toUpperCase();
  const message = String(err && err.message || '').toLowerCase();
  if (AMBIGUOUS_CODES.has(code) || message.includes('timeout') || message.includes('socket hang up')) {
    return 'ambiguous';
  }
  const status = Number(err && (err.status || err.statusCode));
  if (status >= 400 && status < 500) return 'rejected';
  if (message.includes('rejected') || message.includes('invalid api') || message.includes('not configured')) {
    return 'rejected';
  }
  return 'ambiguous';
}

module.exports = {
  classifyProviderResult,
  classifyProviderFailure,
};
