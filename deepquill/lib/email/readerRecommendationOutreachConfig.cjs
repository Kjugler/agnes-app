// Reader Recommendation Outreach — batch labels, templates, and CLI/API parsing.

const BATCH_1_LABEL = 'Recommendation Email Batch 1';
const BATCH_2_LABEL = 'Recommendation Email Batch 2';

const TEMPLATE_BATCH_1 = 'batch_1';
const TEMPLATE_CURRENT = 'current';

const DEFAULT_BATCH_SIZE = 10;

function normalizeBatchLabel(value) {
  if (value === undefined || value === null || value === '') return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Map batch label or shorthand to email template id.
 * - batch_1 / "Batch 1" → original subject (no forward paragraph)
 * - current / batch_2 / "Batch 2" → latest template (Batch 2 copy)
 */
function resolveTemplateId(templateParam, batchLabel) {
  const raw = (templateParam !== undefined && templateParam !== null
    ? String(templateParam)
    : ''
  ).trim().toLowerCase();

  if (raw === TEMPLATE_BATCH_1 || raw === 'original' || raw === '1') {
    return TEMPLATE_BATCH_1;
  }
  if (
    raw === TEMPLATE_CURRENT ||
    raw === 'batch_2' ||
    raw === '2' ||
    raw === 'latest'
  ) {
    return TEMPLATE_CURRENT;
  }

  const batch = (batchLabel || '').toLowerCase();
  if (batch.includes('batch 1')) return TEMPLATE_BATCH_1;
  if (batch.includes('batch 2')) return TEMPLATE_CURRENT;

  return raw ? raw : TEMPLATE_CURRENT;
}

function parseDryRun(value) {
  if (value === undefined || value === null || value === '') return true;
  if (value === '0' || value === false || value === 'false') return false;
  if (value === '1' || value === true || value === 'true') return true;
  return true;
}

function parseLimit(value, defaultLimit = DEFAULT_BATCH_SIZE) {
  if (value === undefined || value === null || value === '') return defaultLimit;
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(n, 100);
}

function parseRequirePurchase(value) {
  if (value === undefined || value === null || value === '') return false;
  if (value === '0' || value === false || value === 'false') return false;
  return true;
}

function parseExcludePreviousBatches(value) {
  if (value === undefined || value === null || value === '') return true;
  if (value === '0' || value === false || value === 'false') return false;
  return true;
}

module.exports = {
  BATCH_1_LABEL,
  BATCH_2_LABEL,
  TEMPLATE_BATCH_1,
  TEMPLATE_CURRENT,
  DEFAULT_BATCH_SIZE,
  normalizeBatchLabel,
  resolveTemplateId,
  parseDryRun,
  parseLimit,
  parseRequirePurchase,
  parseExcludePreviousBatches,
};
