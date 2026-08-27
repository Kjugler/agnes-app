/**
 * Two-lane operational contact suppression.
 *
 * Archive-family ReaderContactDecision rows (archive suppress / restore allow)
 * are a separate fact from independent administrator/provider DNC rows.
 * Restore-allow retires only the archive lane. It is not a global allow.
 *
 * Evaluation is by origin lane, not “latest row wins”.
 * Historical rows are never deleted.
 */
const ARCHIVE_CONTACT_ORIGIN = 'admin_lifecycle_archive';
const RESTORE_CONTACT_ORIGIN = 'admin_lifecycle_restore';
const RESTORE_FALLBACK_STATUS = 'inactive';
const RESTORE_PRIOR_STATUS_REASON = 'restore_prior_status_unavailable';
const RESTORABLE_PRIOR_STATUSES = Object.freeze(['active', 'inactive']);

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isArchiveFamilyOrigin(origin) {
  return origin === ARCHIVE_CONTACT_ORIGIN || origin === RESTORE_CONTACT_ORIGIN;
}

function newestFirst(decisions) {
  return [...(decisions || [])].sort((a, b) => {
    const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (created !== 0) return created;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function latestMatching(decisions, predicate) {
  return newestFirst(decisions).find((row) => predicate(row)) || null;
}

function independentDncActive(decisions) {
  const latest = latestMatching(decisions, (row) => !isArchiveFamilyOrigin(row.origin));
  return Boolean(latest && String(latest.decision).toLowerCase() === 'suppress');
}

function archiveLaneSuppressActive(decisions) {
  const latest = latestMatching(decisions, (row) => isArchiveFamilyOrigin(row.origin));
  return Boolean(latest && String(latest.decision).toLowerCase() === 'suppress');
}

function resolvedRestorePlan(priorStatus) {
  const prior = asTrimmed(priorStatus);
  if (RESTORABLE_PRIOR_STATUSES.includes(prior)) {
    return { status: prior, fallback: false };
  }
  return { status: RESTORE_FALLBACK_STATUS, fallback: true };
}

/**
 * @param {{ profileStatus?: string|null, decisions?: Array, openRestoreReview?: boolean }} input
 * @returns {{
 *   suppressed: boolean,
 *   reason: string|null,
 *   independentDnc: boolean,
 *   archiveExclusionActive: boolean,
 *   restoreReview: boolean,
 *   archived: boolean,
 * }}
 */
function resolveContactSuppression(input = {}) {
  const archived = String(input.profileStatus || '') === 'archived';
  const independentDnc = independentDncActive(input.decisions);
  const archiveExclusionActive = archiveLaneSuppressActive(input.decisions);
  const restoreReview = Boolean(input.openRestoreReview);

  if (archived) {
    return {
      suppressed: true,
      reason: 'archived',
      independentDnc,
      archiveExclusionActive,
      restoreReview,
      archived: true,
    };
  }
  if (independentDnc) {
    return {
      suppressed: true,
      reason: 'manual_dnc',
      independentDnc: true,
      archiveExclusionActive,
      restoreReview,
      archived: false,
    };
  }
  if (archiveExclusionActive) {
    return {
      suppressed: true,
      reason: 'archive_exclusion',
      independentDnc: false,
      archiveExclusionActive: true,
      restoreReview,
      archived: false,
    };
  }
  if (restoreReview) {
    return {
      suppressed: true,
      reason: 'restore_review',
      independentDnc: false,
      archiveExclusionActive: false,
      restoreReview: true,
      archived: false,
    };
  }
  return {
    suppressed: false,
    reason: null,
    independentDnc: false,
    archiveExclusionActive: false,
    restoreReview: false,
    archived: false,
  };
}

module.exports = {
  ARCHIVE_CONTACT_ORIGIN,
  RESTORE_CONTACT_ORIGIN,
  RESTORE_FALLBACK_STATUS,
  RESTORE_PRIOR_STATUS_REASON,
  RESTORABLE_PRIOR_STATUSES,
  isArchiveFamilyOrigin,
  independentDncActive,
  archiveLaneSuppressActive,
  resolvedRestorePlan,
  resolveContactSuppression,
};
