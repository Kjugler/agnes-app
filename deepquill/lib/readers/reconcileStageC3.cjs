/**
 * Stage C3 dry-run reconciliation.
 *
 * Pure: no Prisma, filesystem, env, logging, email, or jobs.
 * Does not mutate its input. Same input → same output.
 *
 * This is NOT send authorization and NOT Stage D. Decision names describe
 * dry-run review status only. Engagement is context only; it cannot
 * authorize outreach or promote an owner into prospect nurture.
 *
 * Contact suppression uses the same resolveContactSuppression order as
 * promotionalOutreachEligibility (archived → independent DNC → archive-lane
 * → open restore_prior_status_unavailable). That helper is not treated as
 * ownership or nurture eligibility: it can return eligible for a purchaser.
 *
 * @typedef {object} StageC3Input
 * @property {string|null} [ownership]
 * @property {string|null} [confidence]
 * @property {string|null} [review]
 * @property {string|null} [contactability]
 * @property {boolean} [nurtureSuppressed]
 * @property {string|null} [email]
 * @property {string|null} [profileStatus]
 * @property {string|null} [legacyStatus]
 * @property {string|null} [purchaseMode]
 * @property {Array} [purchases]
 * @property {Array} [contactDecisions]
 * @property {Array} [decisions]
 * @property {boolean} [openRestoreReview]
 * @property {boolean} [openIdentityReview]
 * @property {boolean} [inIdentityCluster]
 * @property {object|null} [leadAttribution]
 * @property {object|null} [prospectEngagement]
 */

const { OWNERSHIP, REVIEW, CONTACTABILITY } = require('./classifyReader.cjs');
const { resolveContactSuppression } = require('./readerContactSuppression.cjs');
const { isTestSynthetic } = require('./readerLifecycleWorkbench.cjs');
const {
  isReadersAgreeLeadAttribution,
  IDENTITY_ANCHOR,
} = require('./classifyProspectEngagement.cjs');

const C3_DECISION = Object.freeze({
  FUTURE_STAGE_D_CANDIDATE: 'future_stage_d_candidate',
  SUPPRESSED_OWNER: 'suppressed_owner',
  SUPPRESSED_CONTACT: 'suppressed_contact',
  OWNERSHIP_AMBIGUOUS: 'ownership_ambiguous',
  IDENTITY_INSUFFICIENT: 'identity_insufficient',
  TEST_OR_SYNTHETIC: 'test_or_synthetic',
  NO_ACTION: 'no_action',
});

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasReadersAgreeIdentity(input) {
  if (isReadersAgreeLeadAttribution(input && input.leadAttribution)) return true;
  const pe = input && input.prospectEngagement;
  return Boolean(pe && pe.identityAnchor === IDENTITY_ANCHOR);
}

function isTestOrSyntheticRecord(input) {
  if (isTestSynthetic({ email: input.email, purchases: input.purchases || [] })) return true;
  return asTrimmed(input.purchaseMode).toLowerCase() === 'test';
}

function engagementContextReason(engagement) {
  const code = engagement && engagement.engagement ? String(engagement.engagement) : '';
  if (!code) return 'engagement_none';
  return `engagement_${code}`;
}

function pack(decision, reasons, extra) {
  return {
    decision,
    reasons,
    futureStageDCandidate: decision === C3_DECISION.FUTURE_STAGE_D_CANDIDATE,
    contactSuppression: extra.contactSuppression,
    testOrSynthetic: extra.testOrSynthetic,
    hasReadersAgreeIdentity: extra.hasReadersAgreeIdentity,
    engagementContextOnly: true,
  };
}

/**
 * Dry-run only. Does not authorize sending, enrollment, or Stage D.
 *
 * @param {StageC3Input|null|undefined} input
 */
function reconcileStageC3(input) {
  const src = input && typeof input === 'object' ? input : {};
  const ownership = asTrimmed(src.ownership);
  const review = asTrimmed(src.review);
  const contactability = asTrimmed(src.contactability);
  const engagement = src.prospectEngagement && typeof src.prospectEngagement === 'object'
    ? src.prospectEngagement
    : null;
  const contactSuppression = resolveContactSuppression({
    profileStatus: src.profileStatus || src.legacyStatus,
    decisions: src.contactDecisions || src.decisions || [],
    openRestoreReview: src.openRestoreReview === true,
  });
  const testOrSynthetic = isTestOrSyntheticRecord(src);
  const raIdentity = hasReadersAgreeIdentity(src);
  const extra = { contactSuppression, testOrSynthetic, hasReadersAgreeIdentity: raIdentity };

  if (ownership === OWNERSHIP.PURCHASER || ownership === OWNERSHIP.BOOK_OWNER_GIFTED) {
    const reasons = [
      ownership === OWNERSHIP.PURCHASER ? 'owner_purchaser' : 'owner_gifted',
    ];
    if (engagement && engagement.engagement) reasons.push('engagement_does_not_authorize_owner');
    return pack(C3_DECISION.SUPPRESSED_OWNER, reasons, extra);
  }

  if (testOrSynthetic) {
    return pack(C3_DECISION.TEST_OR_SYNTHETIC, ['test_or_synthetic_record'], extra);
  }

  if (contactSuppression.suppressed) {
    return pack(
      C3_DECISION.SUPPRESSED_CONTACT,
      [contactSuppression.reason || 'contact_suppressed'],
      extra,
    );
  }

  const identityUnsafe =
    ownership === OWNERSHIP.UNKNOWN ||
    review === REVIEW.CONFLICTING ||
    review === REVIEW.IDENTITY_REVIEW_REQUIRED ||
    review === REVIEW.INCOMPLETE ||
    src.openIdentityReview === true ||
    src.inIdentityCluster === true;

  if (identityUnsafe) {
    const reasons = [];
    if (ownership === OWNERSHIP.UNKNOWN) reasons.push('ownership_unknown');
    if (review === REVIEW.CONFLICTING) reasons.push('review_conflicting');
    if (review === REVIEW.INCOMPLETE) reasons.push('review_incomplete');
    if (review === REVIEW.IDENTITY_REVIEW_REQUIRED || src.openIdentityReview === true) {
      reasons.push('identity_review_open');
    }
    if (src.inIdentityCluster === true) reasons.push('identity_cluster');
    if (!reasons.length) reasons.push('ownership_or_identity_unsafe');
    return pack(C3_DECISION.OWNERSHIP_AMBIGUOUS, reasons, extra);
  }

  const contactable = contactability === CONTACTABILITY.CONTACTABLE;
  if (!contactable || !raIdentity) {
    const reasons = [];
    if (!contactable) {
      reasons.push(
        contactability === CONTACTABILITY.NO_MAILABLE_EMAIL ? 'no_mailable_email' : 'not_contactable',
      );
    }
    if (!raIdentity) reasons.push('no_readers_agree_identity');
    return pack(C3_DECISION.IDENTITY_INSUFFICIENT, reasons, extra);
  }

  if (ownership === OWNERSHIP.NON_PURCHASER && review === REVIEW.CLEAR) {
    return pack(
      C3_DECISION.FUTURE_STAGE_D_CANDIDATE,
      [
        'confidently_non_purchaser',
        'contactable',
        'readers_agree_identity',
        'engagement_context_only',
        engagementContextReason(engagement),
      ],
      extra,
    );
  }

  return pack(C3_DECISION.NO_ACTION, ['no_authoritative_prospect_path'], extra);
}

module.exports = {
  C3_DECISION,
  reconcileStageC3,
  hasReadersAgreeIdentity,
};
