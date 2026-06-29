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

const READER_STATUSES = ['active', 'inactive'];

const READER_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
};

function isValidReaderSource(value) {
  return typeof value === 'string' && READER_SOURCES.includes(value.trim());
}

function isValidReaderType(value) {
  return typeof value === 'string' && READER_TYPES.includes(value.trim());
}

function isValidReaderStatus(value) {
  return typeof value === 'string' && READER_STATUSES.includes(value.trim());
}

module.exports = {
  READER_SOURCES,
  READER_TYPES,
  READER_TYPE_LABELS,
  READER_STATUSES,
  READER_STATUS_LABELS,
  isValidReaderSource,
  isValidReaderType,
  isValidReaderStatus,
};
