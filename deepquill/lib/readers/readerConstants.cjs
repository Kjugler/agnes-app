const READER_SOURCES = [
  'Barnes & Noble',
  'Amazon',
  'Website',
  'Gift',
  'Book Signing',
  'Friend Referral',
  'Facebook',
  'Instagram',
  'TikTok',
  'X',
  'Truth Social',
  'Microsoft Ads',
  'Google Ads',
  'Other',
];

const READER_TYPES = ['purchased', 'gifted', 'interested'];

const READER_TYPE_LABELS = {
  purchased: 'Purchased Book',
  gifted: 'Gifted Book',
  interested: 'Interested Reader',
};

const READER_STATUSES = ['active', 'inactive', 'archived'];

const SMS_CONSENT_SOURCES = [
  'Book Signing',
  'In person',
  'Phone call',
  'Event booth',
  'Other',
];

const READER_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

function isValidReaderSource(value) {
  return typeof value === 'string' && READER_SOURCES.includes(value.trim());
}

/**
 * PATCH may resubmit a historical/system source unchanged (e.g. Jody Concierge,
 * readers-agree-v2). Changing to a new non-allowlisted value is still rejected.
 * Empty submitted source is allowed (clears source), matching prior PATCH behavior.
 */
function isAcceptedPatchReaderSource(submitted, existing) {
  if (submitted == null) return true;
  const next = typeof submitted === 'string' ? submitted.trim() : '';
  if (!next) return true;
  const current = typeof existing === 'string' ? existing.trim() : '';
  if (next === current) return true;
  return isValidReaderSource(next);
}

function isValidReaderType(value) {
  return typeof value === 'string' && READER_TYPES.includes(value.trim());
}

function isValidReaderStatus(value) {
  return typeof value === 'string' && READER_STATUSES.includes(value.trim());
}

function isValidSmsConsentSource(value) {
  return typeof value === 'string' && SMS_CONSENT_SOURCES.includes(value.trim());
}

module.exports = {
  READER_SOURCES,
  READER_TYPES,
  READER_TYPE_LABELS,
  READER_STATUSES,
  READER_STATUS_LABELS,
  SMS_CONSENT_SOURCES,
  isValidReaderSource,
  isAcceptedPatchReaderSource,
  isValidReaderType,
  isValidReaderStatus,
  isValidSmsConsentSource,
};
