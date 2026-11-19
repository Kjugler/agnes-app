// Advertising click identifiers are not stored unless the server can verify
// measurement consent. A JSON flag or Cookie header on a direct request is
// caller-supplied, so these keys are omitted from new records. UTM parameters
// and referral codes are left in place. Existing rows are not rewritten.

const ADVERTISING_CLICK_ID_KEYS = Object.freeze(['fbclid', 'gclid', 'ttclid', 'msclkid']);

function pathWithoutAdvertisingClickIds(value) {
  const path = String(value || '');
  const queryAt = path.indexOf('?');
  if (queryAt < 0) return path;
  const pathname = path.slice(0, queryAt);
  const params = new URLSearchParams(path.slice(queryAt + 1));
  for (const key of ADVERTISING_CLICK_ID_KEYS) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function omitAdvertisingClickIds(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return meta;
  const out = { ...meta };
  for (const key of ADVERTISING_CLICK_ID_KEYS) delete out[key];
  if (typeof out.path === 'string') out.path = pathWithoutAdvertisingClickIds(out.path);
  return out;
}

module.exports = {
  ADVERTISING_CLICK_ID_KEYS,
  pathWithoutAdvertisingClickIds,
  omitAdvertisingClickIds,
};
