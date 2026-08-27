#!/usr/bin/env node
/**
 * Local fixtures for classifyReader. No database, network, or app boot.
 * Usage: node scripts/verify-reader-classification.cjs
 */
const assert = require('assert');
const {
  classifyReader,
  OWNERSHIP,
  SOURCE,
  CONFIDENCE,
  CONTACTABILITY,
  REVIEW,
  EVIDENCE_KIND,
  EVIDENCE_STATUS,
  REASON,
  ARCHIVED_SALE_STATUS,
} = require('../lib/readers/classifyReader.cjs');

let failed = 0;
let passed = 0;

function snapshot(value) {
  return JSON.stringify(value);
}

function check(name, input, expected) {
  const before = snapshot(input);
  const first = classifyReader(input);
  const after = snapshot(input);
  const second = classifyReader(input);

  try {
    assert.strictEqual(after, before, `${name}: input was mutated`);
    assert.deepStrictEqual(second, first, `${name}: repeated calls differed`);
    for (const [key, value] of Object.entries(expected)) {
      assert.deepStrictEqual(first[key], value, `${name}: ${key}`);
    }
    passed += 1;
    console.log(`ok  ${name}`);
    console.log(
      `    ownership=${first.ownership} sources=${JSON.stringify(first.sources)} confidence=${first.confidence} contactability=${first.contactability} review=${first.review} nurtureSuppressed=${first.nurtureSuppressed}`,
    );
    if (first.reasons.length) console.log(`    reasons=${JSON.stringify(first.reasons)}`);
    if (first.conflicts.length) console.log(`    conflicts=${JSON.stringify(first.conflicts)}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(`    ${err.message}`);
    console.error(`    actual=${JSON.stringify(first)}`);
  }
}

const mail = 'jeff@example.net';

check('01 interested CRM plus live website purchase', {
  userId: 'u1',
  email: mail,
  profile: { readerType: 'interested', source: 'Website' },
  purchases: [{ userId: 'u1', sessionId: 'cs_live_1', saleStatus: 'live', purchasedAt: '2026-08-01' }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE],
  confidence: CONFIDENCE.CONFIRMED,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('02 live website purchase with no ReaderProfile', {
  userId: 'u2',
  email: mail,
  purchases: [{ sessionId: 'cs_live_2', purchasedAt: '2026-08-02' }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE],
  confidence: CONFIDENCE.CONFIRMED,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('03 confirmed Amazon purchaser without Purchase row', {
  userId: 'u3',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.MANUAL_AMAZON,
    status: EVIDENCE_STATUS.CONFIRMED,
    purchaseDate: '2026-07-01',
    details: 'Order confirmation forwarded',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.AMAZON],
  confidence: CONFIDENCE.CONFIRMED,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('04 provisional Amazon from Kris personal knowledge', {
  userId: 'u4',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'Amazon',
    purchaseDate: '2026-07-15',
    details: 'Kris spoke with reader',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.AMAZON],
  confidence: CONFIDENCE.PROVISIONAL,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.INCOMPLETE,
  nurtureSuppressed: true,
});

check('05 provisional B&N with known date', {
  userId: 'jeff',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'Barnes & Noble',
    purchaseDate: '2026-08-10',
    details: "Kris's personal knowledge",
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.BARNES_NOBLE],
  confidence: CONFIDENCE.PROVISIONAL,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.INCOMPLETE,
  nurtureSuppressed: true,
});

check('06 provisional B&N missing date → incomplete', {
  userId: 'u6',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'barnes_noble',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.BARNES_NOBLE],
  confidence: CONFIDENCE.PROVISIONAL,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.INCOMPLETE,
  nurtureSuppressed: true,
});

check('07 website plus B&N is not a conflict', {
  userId: 'u7',
  email: mail,
  purchases: [{ sessionId: 'cs_7', purchasedAt: '2026-06-01' }],
  evidence: [{
    kind: EVIDENCE_KIND.MANUAL_BN,
    status: EVIDENCE_STATUS.CONFIRMED,
    purchaseDate: '2026-06-20',
    details: 'Signing copy',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE, SOURCE.BARNES_NOBLE],
  confidence: CONFIDENCE.CONFIRMED,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
  conflicts: [],
});

check('08 website plus Amazon plus B&N stable source order', {
  userId: 'u8',
  email: mail,
  purchases: [{ sessionId: 'cs_8', purchasedAt: '2026-05-01' }],
  evidence: [
    { kind: EVIDENCE_KIND.MANUAL_BN, status: EVIDENCE_STATUS.CONFIRMED, purchaseDate: '2026-05-02', details: 'bn' },
    { kind: EVIDENCE_KIND.MANUAL_AMAZON, status: EVIDENCE_STATUS.CONFIRMED, purchaseDate: '2026-05-03', details: 'az' },
  ],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE, SOURCE.AMAZON, SOURCE.BARNES_NOBLE],
  confidence: CONFIDENCE.CONFIRMED,
  review: REVIEW.CLEAR,
  conflicts: [],
});

check('09 gifted owner only', {
  userId: 'u9',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.GIFT_BOOK_OWNER,
    status: EVIDENCE_STATUS.CONFIRMED,
    purchaseDate: '2026-04-01',
    details: 'Gifted at event',
  }],
}, {
  ownership: OWNERSHIP.BOOK_OWNER_GIFTED,
  sources: [],
  confidence: CONFIDENCE.CONFIRMED,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('10 gifted owner plus website purchase', {
  userId: 'u10',
  email: mail,
  purchases: [{ sessionId: 'cs_10', purchasedAt: '2026-04-02' }],
  evidence: [{
    kind: EVIDENCE_KIND.GIFT_BOOK_OWNER,
    status: EVIDENCE_STATUS.CONFIRMED,
    purchaseDate: '2026-03-01',
    details: 'Also gifted a copy',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE],
  confidence: CONFIDENCE.CONFIRMED,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('11 CRM purchased label without evidence → unknown/incomplete', {
  userId: 'u11',
  email: mail,
  profile: { readerType: 'purchased', source: null },
}, {
  ownership: OWNERSHIP.UNKNOWN,
  sources: [],
  confidence: CONFIDENCE.UNKNOWN,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.INCOMPLETE,
  nurtureSuppressed: true,
});

check('12 CRM Amazon/B&N purchased as provisional backfill evidence', {
  userId: 'u12',
  email: mail,
  profile: { readerType: 'purchased', source: 'Amazon' },
  evidence: [{
    kind: EVIDENCE_KIND.MANUAL_AMAZON,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'Amazon',
    details: 'backfill_from_crm_source_and_type',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.AMAZON],
  confidence: CONFIDENCE.PROVISIONAL,
  review: REVIEW.INCOMPLETE,
  nurtureSuppressed: true,
});

check('13 archived beta Purchase only', {
  userId: 'u13',
  email: mail,
  purchases: [{ sessionId: 'cs_beta', saleStatus: ARCHIVED_SALE_STATUS, purchasedAt: '2026-01-01' }],
}, {
  ownership: OWNERSHIP.UNKNOWN,
  sources: [],
  confidence: CONFIDENCE.UNKNOWN,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('14 aggregate marketing report only is never a purchaser', {
  userId: 'u14',
  email: mail,
  profile: { readerType: 'interested' },
  evidence: [{
    kind: EVIDENCE_KIND.AGGREGATE_MARKETING,
    status: EVIDENCE_STATUS.CONFIRMED,
    details: 'Amazon Attribution campaign total',
  }],
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
  confidence: CONFIDENCE.UNKNOWN,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: false,
});

check('14b archived operational non-purchaser is nurture-suppressed', {
  userId: 'u14b',
  email: mail,
  profile: { readerType: 'interested', status: 'archived' },
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
  confidence: CONFIDENCE.UNKNOWN,
  contactability: CONTACTABILITY.CONTACTABLE,
  review: REVIEW.CLEAR,
  nurtureSuppressed: true,
});

check('15 confirmed purchaser who is DNC', {
  userId: 'u15',
  email: mail,
  doNotContact: true,
  purchases: [{ sessionId: 'cs_15', purchasedAt: '2026-08-01' }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  contactability: CONTACTABILITY.SUPPRESSED_DNC,
  nurtureSuppressed: true,
});

check('16 non-purchaser who is DNC', {
  userId: 'u16',
  email: mail,
  doNotContact: true,
  profile: { readerType: 'interested' },
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  contactability: CONTACTABILITY.SUPPRESSED_DNC,
  nurtureSuppressed: true,
});

check('17 purchaser with synthetic email', {
  userId: 'u17',
  email: 'phone+15551212@reader.crm',
  purchases: [{ sessionId: 'cs_17', purchasedAt: '2026-08-01' }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  contactability: CONTACTABILITY.NO_MAILABLE_EMAIL,
  nurtureSuppressed: true,
});

check('18 non-purchaser with synthetic email', {
  userId: 'u18',
  email: 'anon+abc@reader.crm',
  profile: { readerType: 'interested' },
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  contactability: CONTACTABILITY.NO_MAILABLE_EMAIL,
  nurtureSuppressed: true,
});

check('19 missing email', {
  userId: 'u19',
  email: null,
  profile: { readerType: 'interested' },
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  contactability: CONTACTABILITY.NO_MAILABLE_EMAIL,
  nurtureSuppressed: true,
});

check('20 duplicate-name identity ambiguity', {
  userId: 'u20',
  email: mail,
  identityReviewRequired: true,
  purchases: [{ sessionId: 'cs_20', purchasedAt: '2026-08-01' }],
}, {
  ownership: OWNERSHIP.UNKNOWN,
  review: REVIEW.IDENTITY_REVIEW_REQUIRED,
  nurtureSuppressed: true,
});

check('21 explicitly disputed purchase association', {
  userId: 'u21',
  email: mail,
  profile: { readerType: 'interested' },
  evidence: [{
    kind: EVIDENCE_KIND.MANUAL_AMAZON,
    status: EVIDENCE_STATUS.DISPUTED,
    purchaseDate: '2026-07-01',
  }],
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
  review: REVIEW.CONFLICTING,
  nurtureSuppressed: true,
});

check('22 Stripe session claimed for a different user', {
  userId: 'u22',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.WEBSITE_STRIPE,
    status: EVIDENCE_STATUS.CONFIRMED,
    stripeSessionId: 'cs_shared',
    purchaseUserId: 'someone-else',
    claimedUserId: 'u22',
  }],
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
  review: REVIEW.CONFLICTING,
  nurtureSuppressed: true,
});

check('23 multiple distinct legitimate transactions', {
  userId: 'u23',
  email: mail,
  purchases: [
    { sessionId: 'cs_23a', purchasedAt: '2026-01-01' },
    { sessionId: 'cs_23b', purchasedAt: '2026-02-01' },
  ],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE],
  confidence: CONFIDENCE.CONFIRMED,
  review: REVIEW.CLEAR,
  conflicts: [],
  nurtureSuppressed: true,
});

check('24 confirmed plus provisional additional source → mixed', {
  userId: 'u24',
  email: mail,
  purchases: [{ sessionId: 'cs_24', purchasedAt: '2026-08-01' }],
  evidence: [{
    kind: EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'Barnes & Noble',
    purchaseDate: '2026-08-10',
  }],
}, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE, SOURCE.BARNES_NOBLE],
  confidence: CONFIDENCE.MIXED,
  review: REVIEW.INCOMPLETE,
  conflicts: [],
  nurtureSuppressed: true,
});

const mutationInput = {
  userId: 'u25',
  email: mail,
  extra: { nested: [1, 2, { keep: true }] },
  purchases: [{ sessionId: 'cs_25', purchasedAt: '2026-08-01', meta: { a: 1 } }],
  evidence: [{ kind: EVIDENCE_KIND.MANUAL_OTHER, status: EVIDENCE_STATUS.CONFIRMED, purchaseDate: '2026-08-02', details: 'other' }],
};
check('25 input objects remain unchanged', mutationInput, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE, SOURCE.OTHER],
});
assert.strictEqual(mutationInput.extra.nested[2].keep, true);
assert.strictEqual(mutationInput.purchases[0].meta.a, 1);

const repeatInput = {
  userId: 'u26',
  email: mail,
  purchases: [{ sessionId: 'cs_26', purchasedAt: '2026-08-01' }],
};
check('26 repeated calls return deeply equal outputs', repeatInput, {
  ownership: OWNERSHIP.PURCHASER,
  sources: [SOURCE.WEBSITE],
  confidence: CONFIDENCE.CONFIRMED,
});

check('unknown evidence kind does not create purchaser', {
  userId: 'u-unk',
  email: mail,
  evidence: [{ kind: 'not_a_real_kind', status: EVIDENCE_STATUS.CONFIRMED, sourceLabel: 'amazon' }],
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
  confidence: CONFIDENCE.UNKNOWN,
});

check('unknown source label on personal knowledge does not become other', {
  userId: 'u-src',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'Book Signing',
  }],
}, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
});

check('malformed input is safe', null, {
  ownership: OWNERSHIP.NON_PURCHASER,
  sources: [],
  confidence: CONFIDENCE.UNKNOWN,
  contactability: CONTACTABILITY.NO_MAILABLE_EMAIL,
  review: REVIEW.CLEAR,
});

check('06b missing-date reason is present', {
  userId: 'u6b',
  email: mail,
  evidence: [{
    kind: EVIDENCE_KIND.KRIS_PERSONAL_KNOWLEDGE,
    status: EVIDENCE_STATUS.PROVISIONAL,
    sourceLabel: 'barnes_noble',
  }],
}, {
  reasons: [
    REASON.PROVISIONAL_PERSONAL_KNOWLEDGE,
    REASON.MISSING_PURCHASE_DATE,
    REASON.MISSING_PURCHASE_DETAILS,
  ],
});

if (failed) {
  console.error(`\nverify-reader-classification: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nverify-reader-classification: ${passed} passed`);
