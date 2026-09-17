#!/usr/bin/env node
/**
 * Local fixtures for Stage C3 dry-run reconciliation.
 * No database, network, email, or app boot.
 * Usage: node scripts/verify-stage-c3-reconciliation.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { OWNERSHIP, REVIEW, CONTACTABILITY } = require('../lib/readers/classifyReader.cjs');
const { C3_DECISION, reconcileStageC3 } = require('../lib/readers/reconcileStageC3.cjs');
const { IDENTITY_ANCHOR } = require('../lib/readers/classifyProspectEngagement.cjs');
const {
  ARCHIVE_CONTACT_ORIGIN,
  RESTORE_PRIOR_STATUS_REASON,
} = require('../lib/readers/readerContactSuppression.cjs');

let failed = 0;
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(`    ${err.message}`);
  }
}

function raIdentity() {
  return { capturedAt: '2026-09-16T12:14:52.355Z', captureSurface: 'landing' };
}

function identifiedEngagement() {
  return {
    engagement: 'identified',
    retailerReturn: false,
    retailerOrigin: null,
    sampleEngaged: false,
    chaptersSampled: ['1'],
    latestEngagementAt: '2026-09-16T12:20:00.000Z',
    reasons: ['email_captured', 'chapter_opened'],
    analyticsOnly: true,
    identityAnchor: IDENTITY_ANCHOR,
  };
}

function retailerEngagement() {
  return {
    engagement: 'retailer_return_engaged',
    retailerReturn: true,
    retailerOrigin: 'amazon',
    sampleEngaged: true,
    chaptersSampled: ['1'],
    latestEngagementAt: '2026-09-16T16:40:00.000Z',
    reasons: ['email_captured', 'retailer_return'],
    analyticsOnly: true,
    identityAnchor: IDENTITY_ANCHOR,
  };
}

function prospectBase(extra = {}) {
  return {
    ownership: OWNERSHIP.NON_PURCHASER,
    confidence: 'unknown',
    review: REVIEW.CLEAR,
    contactability: CONTACTABILITY.CONTACTABLE,
    email: 'prospect@gmail.com',
    profileStatus: 'active',
    leadAttribution: raIdentity(),
    prospectEngagement: identifiedEngagement(),
    ...extra,
  };
}

check('module is pure and names no send eligibility', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/readers/reconcileStageC3.cjs'), 'utf8');
  assert.match(src, /future_stage_d_candidate/);
  assert.doesNotMatch(src, /\bnurtureEligible\b|\bsendEligible\b/);
  assert.doesNotMatch(src, /prisma|sendEmail|mailchimp|create\(|update\(/);
  assert.match(src, /engagement_does_not_authorize_owner/);
});

check('David-shaped prospect is a future Stage D candidate regardless of identified-only engagement', () => {
  const result = reconcileStageC3(
    prospectBase({
      email: 'davidkleink450135@gmail.com',
      prospectEngagement: identifiedEngagement(),
    }),
  );
  assert.equal(result.decision, C3_DECISION.FUTURE_STAGE_D_CANDIDATE);
  assert.equal(result.futureStageDCandidate, true);
  assert.ok(result.reasons.includes('engagement_context_only'));
  assert.ok(result.reasons.includes('engagement_identified'));
  assert.equal(result.engagementContextOnly, true);
});

check('sample_engaged does not change the candidate gate', () => {
  const identified = reconcileStageC3(prospectBase());
  const sampled = reconcileStageC3(
    prospectBase({
      prospectEngagement: { ...identifiedEngagement(), engagement: 'sample_engaged', sampleEngaged: true },
    }),
  );
  assert.equal(identified.decision, sampled.decision);
  assert.equal(sampled.decision, C3_DECISION.FUTURE_STAGE_D_CANDIDATE);
});

check('amazon-b2-shaped test/synthetic retailer-return is not a candidate', () => {
  const result = reconcileStageC3(
    prospectBase({
      email: 'amazon-b2-identity-0916@example.com',
      prospectEngagement: retailerEngagement(),
    }),
  );
  assert.equal(result.decision, C3_DECISION.TEST_OR_SYNTHETIC);
  assert.equal(result.futureStageDCandidate, false);
});

check('a11d6ab-shaped example.com record is test/synthetic', () => {
  const result = reconcileStageC3(
    prospectBase({ email: 'a11d6ab-deploy-verify@example.com' }),
  );
  assert.equal(result.decision, C3_DECISION.TEST_OR_SYNTHETIC);
});

check('purchaser remains owner-suppressed even with retailer-return engagement', () => {
  const result = reconcileStageC3({
    ownership: OWNERSHIP.PURCHASER,
    confidence: 'confirmed',
    review: REVIEW.CLEAR,
    contactability: CONTACTABILITY.CONTACTABLE,
    email: 'dparkinson03@hotmail.com',
    purchaseMode: 'test',
    leadAttribution: raIdentity(),
    prospectEngagement: retailerEngagement(),
  });
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_OWNER);
  assert.ok(result.reasons.includes('owner_purchaser'));
  assert.ok(result.reasons.includes('engagement_does_not_authorize_owner'));
});

check('gifted owner remains owner-suppressed even with sample engagement', () => {
  const result = reconcileStageC3({
    ownership: OWNERSHIP.BOOK_OWNER_GIFTED,
    confidence: 'confirmed',
    review: REVIEW.CLEAR,
    contactability: CONTACTABILITY.CONTACTABLE,
    email: 'gifted-owner@gmail.com',
    leadAttribution: raIdentity(),
    prospectEngagement: { ...identifiedEngagement(), engagement: 'sample_engaged', sampleEngaged: true },
  });
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_OWNER);
  assert.ok(result.reasons.includes('owner_gifted'));
  assert.ok(result.reasons.includes('engagement_does_not_authorize_owner'));
});

check('owner suppression precedes test/synthetic', () => {
  const result = reconcileStageC3({
    ownership: OWNERSHIP.PURCHASER,
    review: REVIEW.CLEAR,
    contactability: CONTACTABILITY.CONTACTABLE,
    email: 'owner@example.com',
    prospectEngagement: retailerEngagement(),
  });
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_OWNER);
});

check('archived is contact-suppressed', () => {
  const result = reconcileStageC3(prospectBase({ profileStatus: 'archived' }));
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_CONTACT);
  assert.ok(result.reasons.includes('archived'));
});

check('independent DNC is contact-suppressed', () => {
  const result = reconcileStageC3(
    prospectBase({
      contactability: CONTACTABILITY.SUPPRESSED_DNC,
      contactDecisions: [
        { id: 'd1', decision: 'suppress', origin: 'admin_manual', createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    }),
  );
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_CONTACT);
  assert.ok(result.reasons.includes('manual_dnc'));
});

check('archive-lane exclusion is contact-suppressed', () => {
  const result = reconcileStageC3(
    prospectBase({
      contactDecisions: [
        {
          id: 'd1',
          decision: 'suppress',
          origin: ARCHIVE_CONTACT_ORIGIN,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    }),
  );
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_CONTACT);
  assert.ok(result.reasons.includes('archive_exclusion'));
});

check('open restore review is contact-suppressed', () => {
  const result = reconcileStageC3(prospectBase({ openRestoreReview: true }));
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_CONTACT);
  assert.ok(result.reasons.includes('restore_review'));
  assert.equal(RESTORE_PRIOR_STATUS_REASON, 'restore_prior_status_unavailable');
});

check('unknown ownership is ambiguous, not a candidate', () => {
  const result = reconcileStageC3(
    prospectBase({ ownership: OWNERSHIP.UNKNOWN, review: REVIEW.INCOMPLETE }),
  );
  assert.equal(result.decision, C3_DECISION.OWNERSHIP_AMBIGUOUS);
});

check('open identity review is ambiguous', () => {
  const result = reconcileStageC3(
    prospectBase({ review: REVIEW.IDENTITY_REVIEW_REQUIRED, openIdentityReview: true }),
  );
  assert.equal(result.decision, C3_DECISION.OWNERSHIP_AMBIGUOUS);
  assert.ok(result.reasons.includes('identity_review_open'));
});

check('identity cluster is ambiguous', () => {
  const result = reconcileStageC3(prospectBase({ inIdentityCluster: true }));
  assert.equal(result.decision, C3_DECISION.OWNERSHIP_AMBIGUOUS);
  assert.ok(result.reasons.includes('identity_cluster'));
});

check('non-purchaser without Readers Agree identity is identity_insufficient', () => {
  const result = reconcileStageC3(
    prospectBase({
      leadAttribution: { enrolledAt: '2026-08-19T20:38:37.865Z' },
      prospectEngagement: {
        engagement: null,
        analyticsOnly: true,
        identityAnchor: null,
        chaptersSampled: [],
        reasons: [],
      },
    }),
  );
  assert.equal(result.decision, C3_DECISION.IDENTITY_INSUFFICIENT);
  assert.ok(result.reasons.includes('no_readers_agree_identity'));
});

check('no mailable email is identity_insufficient', () => {
  const result = reconcileStageC3(
    prospectBase({
      email: 'live-but-unmailable@not-a-fixture.test',
      contactability: CONTACTABILITY.NO_MAILABLE_EMAIL,
    }),
  );
  assert.equal(result.decision, C3_DECISION.IDENTITY_INSUFFICIENT);
  assert.ok(result.reasons.includes('no_mailable_email'));
});

check('historical Phase D leftover fields do not create a candidate', () => {
  const result = reconcileStageC3(
    prospectBase({
      leadAttribution: {
        enrolledAt: '2026-08-19T20:38:37.865Z',
        prospectNurtureStep: 0,
      },
      prospectEngagement: { engagement: null, analyticsOnly: true, identityAnchor: null },
    }),
  );
  assert.equal(result.decision, C3_DECISION.IDENTITY_INSUFFICIENT);
});

check('promotionalOutreachEligibility-shaped purchaser eligible still owner-suppressed', () => {
  const result = reconcileStageC3({
    ownership: OWNERSHIP.PURCHASER,
    review: REVIEW.CLEAR,
    contactability: CONTACTABILITY.CONTACTABLE,
    email: 'owner-promotional-eligible@gmail.com',
    profileStatus: 'active',
    openRestoreReview: false,
    contactDecisions: [],
  });
  assert.equal(result.decision, C3_DECISION.SUPPRESSED_OWNER);
});

check('same input same output', () => {
  const input = prospectBase();
  const a = reconcileStageC3(input);
  const b = reconcileStageC3(input);
  assert.deepEqual(a, b);
  assert.equal(input.ownership, OWNERSHIP.NON_PURCHASER);
});

check('admin console has a trivial Reader Lifecycle navigation link', () => {
  const page = fs.readFileSync(
    path.join(__dirname, '../../agnes-next/src/app/admin/page.tsx'),
    'utf8',
  );
  assert.match(page, /href="\/admin\/reader-lifecycle-preview"/);
  assert.match(page, />[\s]*Reader Lifecycle[\s]*</);
  assert.match(page, /Readers/);
});

console.log(`\nverify-stage-c3-reconciliation: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
