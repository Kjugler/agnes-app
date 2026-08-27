/**
 * Pure Reader Manager classification engine (Phase 1 Checkpoint 1).
 *
 * Side-effect free: no Prisma, filesystem, env, logging, or email.
 * Does not mutate its input. Same input → same output.
 *
 * This module classifies plain snapshot data. It does not read CRM rows,
 * write evidence, send mail, or change jobs. `nurtureSuppressed` is a
 * derived flag for later display / Phase 2 — it is not wired to any sender.
 *
 * Input assumptions (all fields optional; missing / malformed values are ignored):
 * @typedef {object} ClassifyReaderInput
 * @property {string|null} [userId]
 * @property {string|null} [email]
 * @property {boolean} [doNotContact]
 * @property {boolean} [identityReviewRequired]
 * @property {boolean} [identityAmbiguous] alias of identityReviewRequired
 * @property {{ readerType?: string|null, source?: string|null, status?: string|null }|null} [profile]
 * @property {Array<{
 *   userId?: string|null,
 *   sessionId?: string|null,
 *   saleStatus?: string|null,
 *   purchasedAt?: string|Date|null,
 * }>} [purchases]
 * @property {Array<{
 *   kind?: string|null,
 *   status?: string|null,
 *   sourceLabel?: string|null,
 *   purchaseDate?: string|Date|null,
 *   details?: string|null,
 *   stripeSessionId?: string|null,
 *   claimedUserId?: string|null,
 *   purchaseUserId?: string|null,
 *   assignedToMultipleUsers?: boolean,
 * }>} [evidence]
 */

const OWNERSHIP = Object.freeze({
  PURCHASER: 'purchaser',
  BOOK_OWNER_GIFTED: 'book_owner_gifted',
  NON_PURCHASER: 'non_purchaser',
  UNKNOWN: 'unknown',
});

const SOURCE = Object.freeze({
  WEBSITE: 'website',
  AMAZON: 'amazon',
  BARNES_NOBLE: 'barnes_noble',
  OTHER: 'other',
});

const SOURCE_ORDER = Object.freeze([
  SOURCE.WEBSITE,
  SOURCE.AMAZON,
  SOURCE.BARNES_NOBLE,
  SOURCE.OTHER,
]);

const CONFIDENCE = Object.freeze({
  CONFIRMED: 'confirmed',
  PROVISIONAL: 'provisional',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
});

const CONTACTABILITY = Object.freeze({
  CONTACTABLE: 'contactable',
  SUPPRESSED_DNC: 'suppressed_do_not_contact',
  NO_MAILABLE_EMAIL: 'no_mailable_email',
});

const REVIEW = Object.freeze({
  CLEAR: 'clear',
  INCOMPLETE: 'incomplete',
  CONFLICTING: 'conflicting',
  IDENTITY_REVIEW_REQUIRED: 'identity_review_required',
});

const EVIDENCE_KIND = Object.freeze({
  WEBSITE_STRIPE: 'website_stripe',
  MANUAL_AMAZON: 'manual_amazon',
  MANUAL_BN: 'manual_bn',
  MANUAL_OTHER: 'manual_other',
  GIFT_BOOK_OWNER: 'gift_book_owner',
  KRIS_PERSONAL_KNOWLEDGE: 'kris_personal_knowledge',
  AGGREGATE_MARKETING: 'aggregate_marketing_not_individual',
});

const EVIDENCE_STATUS = Object.freeze({
  PROVISIONAL: 'provisional',
  CONFIRMED: 'confirmed',
  DISPUTED: 'disputed',
  SUPERSEDED: 'superseded',
});

const REASON = Object.freeze({
  LIVE_WEBSITE_PURCHASE: 'live_website_purchase',
  CONFIRMED_MANUAL_RETAILER: 'confirmed_manual_retailer',
  PROVISIONAL_PERSONAL_KNOWLEDGE: 'provisional_personal_knowledge',
  PROVISIONAL_MANUAL_RETAILER: 'provisional_manual_retailer',
  GIFT_WITHOUT_PURCHASE: 'gift_without_purchase',
  GIFT_AND_PURCHASE: 'gift_and_purchase',
  ARCHIVED_PURCHASE_ONLY: 'archived_purchase_only',
  LEGACY_PURCHASED_LABEL_WITHOUT_EVIDENCE: 'legacy_purchased_label_without_evidence',
  LEGACY_GIFTED_LABEL_WITHOUT_EVIDENCE: 'legacy_gifted_label_without_evidence',
  AGGREGATE_NOT_INDIVIDUAL_PROOF: 'aggregate_not_individual_proof',
  IDENTITY_REVIEW_REQUIRED: 'identity_review_required',
  MISSING_PURCHASE_DATE: 'missing_purchase_date',
  MISSING_PURCHASE_DETAILS: 'missing_purchase_details',
  DNC: 'dnc',
  UNMAILABLE_EMAIL: 'unmailable_email',
  STRIPE_SESSION_USER_MISMATCH: 'stripe_session_user_mismatch',
  DISPUTED_ASSOCIATION: 'disputed_association',
  ASSIGNED_TO_MULTIPLE_USERS: 'assigned_to_multiple_users',
  UNKNOWN_EVIDENCE_KIND_IGNORED: 'unknown_evidence_kind_ignored',
  UNKNOWN_SOURCE_LABEL_IGNORED: 'unknown_source_label_ignored',
  MIXED_CONFIRMED_AND_PROVISIONAL: 'mixed_confirmed_and_provisional',
  SYNTHETIC_OR_PLACEHOLDER_EMAIL: 'synthetic_or_placeholder_email',
});

const ARCHIVED_SALE_STATUS = 'archived_beta';
const SYNTHETIC_EMAIL_DOMAIN = 'reader.crm';
const BLOCKED_EMAILS = Object.freeze(['me@here.com', 'test@test.com', 'noreply@noreply.com']);
const BLOCKED_DOMAINS = Object.freeze(['example.com', 'example.org', 'test.com', 'here.com']);

const PURCHASE_KINDS = Object.freeze([
  EVIDENCE_KIND.WEBSITE_STRIPE,
  EVIDENCE_KIND.MANUAL_AMAZON,
  EVIDENCE_KIND.MANUAL_BN,
  EVIDENCE_KIND.MANUAL_OTHER,
  EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(raw) {
  const s = asTrimmedString(raw).toLowerCase();
  if (s === EVIDENCE_STATUS.CONFIRMED) return EVIDENCE_STATUS.CONFIRMED;
  if (s === EVIDENCE_STATUS.DISPUTED) return EVIDENCE_STATUS.DISPUTED;
  if (s === EVIDENCE_STATUS.SUPERSEDED) return EVIDENCE_STATUS.SUPERSEDED;
  if (s === EVIDENCE_STATUS.PROVISIONAL || !s) return EVIDENCE_STATUS.PROVISIONAL;
  return null;
}

function normalizeKind(raw) {
  const s = asTrimmedString(raw).toLowerCase();
  if (!s) return null;
  if (Object.values(EVIDENCE_KIND).includes(s)) return s;
  return null;
}

/**
 * Map an explicit retailer/gift label. Unknown labels do not become `other`.
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeSourceLabel(raw) {
  const s = asTrimmedString(raw).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'website' || s === 'stripe' || s === 'direct') return SOURCE.WEBSITE;
  if (s === 'amazon') return SOURCE.AMAZON;
  if (
    s === 'barnes noble' ||
    s === 'barnes & noble' ||
    s === 'bn' ||
    s === 'b&n'
  ) {
    return SOURCE.BARNES_NOBLE;
  }
  if (s === 'other') return SOURCE.OTHER;
  if (s === 'gift') return 'gift';
  return null;
}

function sourceFromKind(kind) {
  if (kind === EVIDENCE_KIND.WEBSITE_STRIPE) return SOURCE.WEBSITE;
  if (kind === EVIDENCE_KIND.MANUAL_AMAZON) return SOURCE.AMAZON;
  if (kind === EVIDENCE_KIND.MANUAL_BN) return SOURCE.BARNES_NOBLE;
  if (kind === EVIDENCE_KIND.MANUAL_OTHER) return SOURCE.OTHER;
  if (kind === EVIDENCE_KIND.GIFT_BOOK_OWNER) return 'gift';
  return null;
}

function orderedSources(set) {
  return SOURCE_ORDER.filter((key) => set.has(key));
}

function addReason(reasons, code) {
  if (code && !reasons.includes(code)) reasons.push(code);
}

function hasText(value) {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@') || trimmed.length < 3) return null;
  return trimmed;
}

function isSyntheticEmail(email) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && normalized.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`));
}

function isPlaceholderEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (BLOCKED_EMAILS.includes(normalized)) return true;
  const domain = normalized.split('@')[1] || '';
  return BLOCKED_DOMAINS.includes(domain);
}

function isMailable(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isSyntheticEmail(normalized) || isPlaceholderEmail(normalized)) return false;
  return true;
}

function isLivePurchase(purchase) {
  if (!purchase || typeof purchase !== 'object') return false;
  return asTrimmedString(purchase.saleStatus).toLowerCase() !== ARCHIVED_SALE_STATUS;
}

function sessionMismatch(userId, evidence) {
  const sessionId = asTrimmedString(evidence.stripeSessionId);
  if (!sessionId) return false;
  const actualOwner = asTrimmedString(evidence.purchaseUserId);
  const claimed = asTrimmedString(evidence.claimedUserId) || asTrimmedString(userId);
  if (actualOwner && claimed && actualOwner !== claimed) return true;
  return false;
}

/**
 * @param {ClassifyReaderInput|null|undefined} input
 */
function classifyReader(input) {
  const src = input && typeof input === 'object' ? input : {};
  const userId = asTrimmedString(src.userId);
  const email = src.email;
  const profile = src.profile && typeof src.profile === 'object' ? src.profile : null;
  const purchases = asArray(src.purchases);
  const evidenceRows = asArray(src.evidence);
  const identityReviewRequired = Boolean(src.identityReviewRequired || src.identityAmbiguous);
  const doNotContact = Boolean(src.doNotContact);

  const reasons = [];
  const conflicts = [];
  const sourceSet = new Set();

  let sawAggregate = false;
  let sawUnknownKind = false;
  let sawUnknownSourceLabel = false;
  let hasConfirmedOwnershipEvidence = false;
  let hasProvisionalOwnershipEvidence = false;
  let hasGiftEvidence = false;
  let hasPurchaseEvidence = false;
  let missingDate = false;
  let missingDetails = false;

  const livePurchases = [];
  const archivedPurchases = [];
  for (const purchase of purchases) {
    if (!purchase || typeof purchase !== 'object') continue;
    if (isLivePurchase(purchase)) livePurchases.push(purchase);
    else archivedPurchases.push(purchase);
  }

  if (livePurchases.length > 0) {
    hasPurchaseEvidence = true;
    hasConfirmedOwnershipEvidence = true;
    sourceSet.add(SOURCE.WEBSITE);
    addReason(reasons, REASON.LIVE_WEBSITE_PURCHASE);
    if (!livePurchases.some((p) => hasText(p.purchasedAt))) missingDate = true;
  }

  for (const row of evidenceRows) {
    if (!row || typeof row !== 'object') continue;
    const kind = normalizeKind(row.kind);
    if (!kind) {
      if (asTrimmedString(row.kind)) sawUnknownKind = true;
      continue;
    }
    const status = normalizeStatus(row.status);
    if (!status) continue;

    if (kind === EVIDENCE_KIND.AGGREGATE_MARKETING) {
      sawAggregate = true;
      continue;
    }

    if (status === EVIDENCE_STATUS.SUPERSEDED) continue;

    if (status === EVIDENCE_STATUS.DISPUTED) {
      conflicts.push({ code: REASON.DISPUTED_ASSOCIATION });
      addReason(reasons, REASON.DISPUTED_ASSOCIATION);
      continue;
    }

    if (row.assignedToMultipleUsers === true) {
      conflicts.push({
        code: REASON.ASSIGNED_TO_MULTIPLE_USERS,
        stripeSessionId: asTrimmedString(row.stripeSessionId) || null,
      });
      addReason(reasons, REASON.ASSIGNED_TO_MULTIPLE_USERS);
      continue;
    }

    if (sessionMismatch(userId, row)) {
      conflicts.push({
        code: REASON.STRIPE_SESSION_USER_MISMATCH,
        stripeSessionId: asTrimmedString(row.stripeSessionId) || null,
      });
      addReason(reasons, REASON.STRIPE_SESSION_USER_MISMATCH);
      continue;
    }

    const kindSource = sourceFromKind(kind);
    const labelSource = normalizeSourceLabel(row.sourceLabel);
    if (asTrimmedString(row.sourceLabel) && labelSource == null) {
      sawUnknownSourceLabel = true;
    }

    if (kind === EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE) {
      if (labelSource == null) {
        sawUnknownSourceLabel = true;
        continue;
      }
      if (labelSource === 'gift') {
        hasGiftEvidence = true;
        if (status === EVIDENCE_STATUS.CONFIRMED) hasConfirmedOwnershipEvidence = true;
        else hasProvisionalOwnershipEvidence = true;
        addReason(reasons, REASON.PROVISIONAL_PERSONAL_KNOWLEDGE);
        if (!hasText(row.purchaseDate)) missingDate = true;
        continue;
      }
      hasPurchaseEvidence = true;
      sourceSet.add(labelSource);
      if (status === EVIDENCE_STATUS.CONFIRMED) {
        hasConfirmedOwnershipEvidence = true;
        addReason(reasons, REASON.CONFIRMED_MANUAL_RETAILER);
      } else {
        hasProvisionalOwnershipEvidence = true;
        addReason(reasons, REASON.PROVISIONAL_PERSONAL_KNOWLEDGE);
      }
      if (!hasText(row.purchaseDate)) missingDate = true;
      if (status === EVIDENCE_STATUS.PROVISIONAL && !hasText(row.details) && !hasText(row.purchaseDate)) {
        missingDetails = true;
      }
      continue;
    }

    if (kind === EVIDENCE_KIND.GIFT_BOOK_OWNER) {
      hasGiftEvidence = true;
      if (status === EVIDENCE_STATUS.CONFIRMED) hasConfirmedOwnershipEvidence = true;
      else hasProvisionalOwnershipEvidence = true;
      if (!hasText(row.purchaseDate)) missingDate = true;
      continue;
    }

    if (!PURCHASE_KINDS.includes(kind)) continue;

    const source = kindSource || (labelSource && labelSource !== 'gift' ? labelSource : null);
    if (!source) continue;

    hasPurchaseEvidence = true;
    sourceSet.add(source);
    if (status === EVIDENCE_STATUS.CONFIRMED) {
      hasConfirmedOwnershipEvidence = true;
      addReason(reasons, REASON.CONFIRMED_MANUAL_RETAILER);
    } else {
      hasProvisionalOwnershipEvidence = true;
      addReason(reasons, REASON.PROVISIONAL_MANUAL_RETAILER);
    }
    if (!hasText(row.purchaseDate)) missingDate = true;
    if (status === EVIDENCE_STATUS.PROVISIONAL && !hasText(row.details) && !hasText(row.purchaseDate)) {
      missingDetails = true;
    }
  }

  if (sawUnknownKind) addReason(reasons, REASON.UNKNOWN_EVIDENCE_KIND_IGNORED);
  if (sawUnknownSourceLabel) addReason(reasons, REASON.UNKNOWN_SOURCE_LABEL_IGNORED);
  if (sawAggregate) addReason(reasons, REASON.AGGREGATE_NOT_INDIVIDUAL_PROOF);

  const readerType = asTrimmedString(profile && profile.readerType).toLowerCase();
  const legacyPurchasedLabel = readerType === 'purchased' && !hasPurchaseEvidence && !hasGiftEvidence;
  const legacyGiftedLabel = readerType === 'gifted' && !hasPurchaseEvidence && !hasGiftEvidence;

  let ownership;
  if (identityReviewRequired) {
    ownership = OWNERSHIP.UNKNOWN;
    addReason(reasons, REASON.IDENTITY_REVIEW_REQUIRED);
  } else if (hasGiftEvidence && !hasPurchaseEvidence) {
    ownership = OWNERSHIP.BOOK_OWNER_GIFTED;
    addReason(reasons, REASON.GIFT_WITHOUT_PURCHASE);
  } else if (hasPurchaseEvidence) {
    ownership = OWNERSHIP.PURCHASER;
    if (hasGiftEvidence) addReason(reasons, REASON.GIFT_AND_PURCHASE);
  } else if (archivedPurchases.length > 0) {
    ownership = OWNERSHIP.UNKNOWN;
    addReason(reasons, REASON.ARCHIVED_PURCHASE_ONLY);
  } else if (legacyPurchasedLabel) {
    ownership = OWNERSHIP.UNKNOWN;
    addReason(reasons, REASON.LEGACY_PURCHASED_LABEL_WITHOUT_EVIDENCE);
  } else if (legacyGiftedLabel) {
    ownership = OWNERSHIP.UNKNOWN;
    addReason(reasons, REASON.LEGACY_GIFTED_LABEL_WITHOUT_EVIDENCE);
  } else {
    ownership = OWNERSHIP.NON_PURCHASER;
  }

  let confidence;
  if (!hasPurchaseEvidence && !hasGiftEvidence) {
    confidence = CONFIDENCE.UNKNOWN;
  } else if (hasConfirmedOwnershipEvidence && hasProvisionalOwnershipEvidence) {
    confidence = CONFIDENCE.MIXED;
    addReason(reasons, REASON.MIXED_CONFIRMED_AND_PROVISIONAL);
  } else if (hasConfirmedOwnershipEvidence) {
    confidence = CONFIDENCE.CONFIRMED;
  } else if (hasProvisionalOwnershipEvidence) {
    confidence = CONFIDENCE.PROVISIONAL;
  } else {
    confidence = CONFIDENCE.UNKNOWN;
  }

  let contactability;
  if (doNotContact) {
    contactability = CONTACTABILITY.SUPPRESSED_DNC;
    addReason(reasons, REASON.DNC);
    if (!isMailable(email)) {
      addReason(reasons, isSyntheticEmail(email) || isPlaceholderEmail(email)
        ? REASON.SYNTHETIC_OR_PLACEHOLDER_EMAIL
        : REASON.UNMAILABLE_EMAIL);
    }
  } else if (!isMailable(email)) {
    contactability = CONTACTABILITY.NO_MAILABLE_EMAIL;
    addReason(
      reasons,
      isSyntheticEmail(email) || isPlaceholderEmail(email)
        ? REASON.SYNTHETIC_OR_PLACEHOLDER_EMAIL
        : REASON.UNMAILABLE_EMAIL,
    );
  } else {
    contactability = CONTACTABILITY.CONTACTABLE;
  }

  if (missingDate && (hasPurchaseEvidence || hasGiftEvidence)) {
    addReason(reasons, REASON.MISSING_PURCHASE_DATE);
  }
  if (missingDetails && (hasPurchaseEvidence || hasGiftEvidence)) {
    addReason(reasons, REASON.MISSING_PURCHASE_DETAILS);
  }

  let review;
  if (identityReviewRequired) {
    review = REVIEW.IDENTITY_REVIEW_REQUIRED;
  } else if (conflicts.length > 0) {
    review = REVIEW.CONFLICTING;
  } else if (
    legacyPurchasedLabel ||
    legacyGiftedLabel ||
    hasProvisionalOwnershipEvidence ||
    ((hasPurchaseEvidence || hasGiftEvidence) && (missingDate || missingDetails))
  ) {
    review = REVIEW.INCOMPLETE;
  } else {
    review = REVIEW.CLEAR;
  }

  const confidentlyNonPurchaser =
    ownership === OWNERSHIP.NON_PURCHASER && review === REVIEW.CLEAR;

  const nurtureSuppressed =
    (profile && String(profile.status || '') === 'archived') ||
    ownership === OWNERSHIP.PURCHASER ||
    ownership === OWNERSHIP.BOOK_OWNER_GIFTED ||
    ownership === OWNERSHIP.UNKNOWN ||
    contactability !== CONTACTABILITY.CONTACTABLE ||
    !confidentlyNonPurchaser;

  return {
    ownership,
    sources: orderedSources(sourceSet),
    confidence,
    contactability,
    review,
    nurtureSuppressed,
    reasons,
    conflicts,
  };
}

module.exports = {
  classifyReader,
  OWNERSHIP,
  SOURCE,
  SOURCE_ORDER,
  CONFIDENCE,
  CONTACTABILITY,
  REVIEW,
  EVIDENCE_KIND,
  EVIDENCE_STATUS,
  REASON,
  ARCHIVED_SALE_STATUS,
};
