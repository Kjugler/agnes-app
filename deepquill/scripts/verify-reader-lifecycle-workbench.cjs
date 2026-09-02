#!/usr/bin/env node
/**
 * Pure tests for readerLifecycleWorkbench.cjs. No database, no network.
 */
const assert = require('assert');
const {
  PRIMARY_QUEUES,
  QUEUE_PRECEDENCE,
  PURCHASE_MODE,
  sessionKind,
  purchaseMode,
  purchaseSessionMode,
  nameParts,
  nameClusterKey,
  buildIdentityClusters,
  isTestSynthetic,
  isFixtureEmail,
  hasUsableReaderName,
  assignPrimaryQueue,
  recommendedAction,
  historicalCrmConflict,
  assertExclusiveQueues,
} = require('../lib/readers/readerLifecycleWorkbench.cjs');

let failed = 0;
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(`  ${err && err.message ? err.message : err}`);
  }
}

check('precedence lists every exclusive queue once', () => {
  assert.deepStrictEqual(QUEUE_PRECEDENCE, PRIMARY_QUEUES);
  assert.deepStrictEqual(PRIMARY_QUEUES, [
    'archived',
    'dnc',
    'identity',
    'test_synthetic',
    'legacy_gifted',
    'legacy_purchaser',
    'prospects',
    'needs_review',
    'clear_no_action',
  ]);
});

check('cs_test_ only => TEST; cs_live_ only => LIVE; both => MIXED', () => {
  assert.strictEqual(sessionKind('cs_test_abc'), 'test');
  assert.strictEqual(sessionKind('cs_live_abc'), 'live');
  assert.strictEqual(
    purchaseMode([{ sessionId: 'cs_test_1', saleStatus: 'live' }]),
    PURCHASE_MODE.TEST,
  );
  assert.strictEqual(
    purchaseMode([{ sessionId: 'cs_live_1', saleStatus: 'live' }]),
    PURCHASE_MODE.LIVE,
  );
  assert.strictEqual(
    purchaseMode([
      { sessionId: 'cs_live_1', saleStatus: 'live' },
      { sessionId: 'cs_test_1', saleStatus: 'live' },
    ]),
    PURCHASE_MODE.MIXED,
  );
  assert.strictEqual(purchaseSessionMode({ sessionId: 'cs_test_1' }), 'test');
  assert.strictEqual(purchaseSessionMode({ sessionId: 'cs_live_1' }), 'live');
});

check('MIXED is not test-only', () => {
  const mixed = {
    user: { fname: 'Augustus', lname: 'Bailey' },
    purchases: [
      { sessionId: 'cs_live_1', saleStatus: 'live' },
      { sessionId: 'cs_test_1', saleStatus: 'live' },
    ],
    email: 'augustus@real.test',
    ownership: 'purchaser',
    review: 'clear',
    reasons: ['live_website_purchase'],
  };
  assert.strictEqual(purchaseMode(mixed.purchases), PURCHASE_MODE.MIXED);
  assert.strictEqual(isTestSynthetic(mixed), false);
  assert.strictEqual(assignPrimaryQueue(mixed), 'clear_no_action');
});

check('archived and dnc beat identity and clear', () => {
  assert.strictEqual(
    assignPrimaryQueue({
      legacyStatus: 'archived',
      inIdentityCluster: true,
      review: 'clear',
      ownership: 'purchaser',
    }),
    'archived',
  );
  assert.strictEqual(
    assignPrimaryQueue({
      contactability: 'suppressed_do_not_contact',
      inIdentityCluster: true,
      review: 'clear',
    }),
    'dnc',
  );
});

check('identity precedence wins over clear purchaser and gifted leftover', () => {
  assert.strictEqual(
    assignPrimaryQueue({
      inIdentityCluster: true,
      ownership: 'purchaser',
      review: 'clear',
      reasons: ['live_website_purchase'],
      purchases: [{ sessionId: 'cs_live_1', saleStatus: 'live' }],
    }),
    'identity',
  );
  assert.strictEqual(
    assignPrimaryQueue({
      openIdentityReview: true,
      reasons: ['legacy_gifted_label_without_evidence'],
      ownership: 'unknown',
      review: 'incomplete',
    }),
    'identity',
  );
});

check('test_synthetic from test-only purchases, not from reader.crm placeholders', () => {
  assert.strictEqual(
    isTestSynthetic({
      purchases: [{ sessionId: 'cs_test_1', saleStatus: 'live' }],
      email: 'person@gmail.com',
    }),
    true,
  );
  assert.strictEqual(
    assignPrimaryQueue({
      purchases: [{ sessionId: 'cs_test_1', saleStatus: 'live' }],
      email: 'person@gmail.com',
      ownership: 'purchaser',
      review: 'clear',
      reasons: ['live_website_purchase'],
    }),
    'test_synthetic',
  );
  assert.strictEqual(
    isTestSynthetic({
      purchases: [],
      email: 'phone+15551212@reader.crm',
    }),
    false,
  );
  assert.strictEqual(
    assignPrimaryQueue({
      email: 'phone+15551212@reader.crm',
      reasons: ['legacy_gifted_label_without_evidence'],
      ownership: 'unknown',
      review: 'incomplete',
    }),
    'legacy_gifted',
  );
});

check('explicit fixture email is test_synthetic; ordinary test.com/here.com are not', () => {
  assert.strictEqual(isTestSynthetic({ email: 'deploy-test@example.com', purchases: [] }), true);
  assert.strictEqual(isTestSynthetic({ email: 'prod-smoke+lead@example.org', purchases: [] }), true);
  assert.strictEqual(isFixtureEmail('me@here.com'), true);
  assert.strictEqual(isFixtureEmail('test@test.com'), true);
  assert.strictEqual(isFixtureEmail('noreply@noreply.com'), true);
  assert.strictEqual(isTestSynthetic({ email: 'me@here.com', purchases: [] }), true);
  assert.strictEqual(isTestSynthetic({ email: 'test@test.com', purchases: [] }), true);
  assert.strictEqual(isTestSynthetic({ email: 'jeff.reader@example.net', purchases: [] }), false);
  assert.strictEqual(isFixtureEmail('person@test.com'), false);
  assert.strictEqual(isFixtureEmail('reader@here.com'), false);
  assert.strictEqual(isTestSynthetic({ email: 'person@test.com', purchases: [] }), false);
  assert.strictEqual(isTestSynthetic({ email: 'reader@here.com', purchases: [] }), false);
});

check('nameless live purchaser is needs_review, not clear_no_action', () => {
  const nameless = {
    user: { fname: '', lname: null },
    email: 'nameless.live@example.net',
    ownership: 'purchaser',
    review: 'clear',
    reasons: ['live_website_purchase'],
    purchases: [{ sessionId: 'cs_live_1', saleStatus: 'live' }],
  };
  assert.strictEqual(hasUsableReaderName(nameless), false);
  assert.strictEqual(assignPrimaryQueue(nameless), 'needs_review');
  assert.strictEqual(
    recommendedAction('needs_review', nameless),
    'Review missing reader identity',
  );
  assert.strictEqual(
    assignPrimaryQueue({
      ...nameless,
      inIdentityCluster: true,
    }),
    'identity',
  );
  assert.strictEqual(
    assignPrimaryQueue({
      user: { fname: 'Judy', lname: 'Young' },
      email: 'named.live@example.net',
      ownership: 'purchaser',
      review: 'clear',
      reasons: ['live_website_purchase'],
      purchases: [{ sessionId: 'cs_live_1', saleStatus: 'live' }],
    }),
    'clear_no_action',
  );
  assert.strictEqual(hasUsableReaderName({ user: { fname: 'Kris Jugler', lname: null } }), true);
  assert.strictEqual(hasUsableReaderName({ user: { fname: '', lname: 'Young' } }), false);
});

check('name split handles full-name-in-fname with null lname', () => {
  const split = nameParts({ fname: 'Kris Jugler', lname: null });
  assert.deepStrictEqual(split, { first: 'Kris', last: 'Jugler' });
  assert.strictEqual(nameClusterKey({ fname: 'Kris Jugler', lname: null }), 'name:kris jugler');
  assert.strictEqual(
    nameClusterKey({ fname: 'Kris', lname: 'Jugler' }),
    'name:kris jugler',
  );
});

check('last name alone never creates a cluster', () => {
  assert.strictEqual(nameClusterKey({ fname: '', lname: 'Jugler' }), null);
  assert.strictEqual(nameClusterKey({ fname: 'T', lname: 'Jugler' }), null);
  const clusters = buildIdentityClusters([
    { readerProfileId: 'a', user: { fname: 'Denise', lname: 'Jugler' } },
    { readerProfileId: 'b', user: { fname: 'Frank', lname: 'Jugler' } },
    { readerProfileId: 'c', user: { fname: 'Tanner Jugler', lname: null } },
  ]);
  assert.strictEqual(clusters.size, 0);
});

check('Kris-style name pair clusters; email/phone also cluster', () => {
  const clusters = buildIdentityClusters([
    {
      readerProfileId: 'k1',
      user: { fname: 'Kris', lname: 'Jugler' },
      email: 'kris.k.jugler@gmail.com',
    },
    {
      readerProfileId: 'k2',
      user: { fname: 'Kris Jugler', lname: null },
      email: 'kriskjugler@gmail.com',
    },
    {
      readerProfileId: 'f1',
      user: { fname: 'Kevin', lname: 'Flye' },
      email: 'kevinflye16@yahoo.com',
    },
    {
      readerProfileId: 'f2',
      user: { fname: 'kevin', lname: 'Flye' },
      email: 'kevinflye@yahoo.com',
    },
  ]);
  assert.ok(clusters.get('k1'));
  assert.ok(clusters.get('k2'));
  assert.ok(clusters.get('k1').memberIds.includes('k2'));
  assert.ok(clusters.get('f1').memberIds.includes('f2'));
});

check('every fixture profile gets exactly one primary queue and counts sum', () => {
  const items = [
    { primaryQueue: assignPrimaryQueue({ legacyStatus: 'archived' }) },
    { primaryQueue: assignPrimaryQueue({ contactability: 'suppressed_do_not_contact' }) },
    { primaryQueue: assignPrimaryQueue({ inIdentityCluster: true, review: 'clear' }) },
    {
      primaryQueue: assignPrimaryQueue({
        purchases: [{ sessionId: 'cs_test_1', saleStatus: 'live' }],
        review: 'clear',
        ownership: 'purchaser',
      }),
    },
    {
      primaryQueue: assignPrimaryQueue({
        reasons: ['legacy_gifted_label_without_evidence'],
        review: 'incomplete',
      }),
    },
    {
      primaryQueue: assignPrimaryQueue({
        reasons: ['legacy_purchased_label_without_evidence'],
        review: 'incomplete',
      }),
    },
    { primaryQueue: assignPrimaryQueue({ ownership: 'non_purchaser', review: 'clear' }) },
    { primaryQueue: assignPrimaryQueue({ review: 'conflicting', ownership: 'unknown' }) },
    {
      primaryQueue: assignPrimaryQueue({
        ownership: 'book_owner_gifted',
        review: 'clear',
        reasons: ['gift_without_purchase'],
      }),
    },
  ];
  const counts = assertExclusiveQueues(items);
  assert.strictEqual(items.length, 9);
  assert.strictEqual(
    PRIMARY_QUEUES.reduce((n, key) => n + counts[key], 0),
    9,
  );
  assert.strictEqual(new Set(items.map((row) => row.primaryQueue)).size, 9);
});

check('historical CRM conflict is display-only metadata', () => {
  const conflict = historicalCrmConflict({
    notes: '[2026-07-24] drove ebook to him',
    evidence: [
      {
        status: 'confirmed',
        kind: 'gift_book_owner',
        details: 'Kris personally gave Randy a physical paperback copy of The Agnes Protocol.',
      },
    ],
  });
  assert.ok(conflict);
  assert.strictEqual(conflict.code, 'format_conflict');
  assert.match(conflict.message, /historical/);
  const none = historicalCrmConflict({
    notes: 'Gave him a copy for his birthday',
    evidence: [{ status: 'confirmed', details: 'physical paperback' }],
  });
  assert.strictEqual(none, null);
  const supersededOnly = historicalCrmConflict({
    notes: 'drove ebook to him',
    evidence: [{ status: 'superseded', details: 'physical paperback' }],
  });
  assert.strictEqual(supersededOnly, null);
});

check('recommended actions stay conservative', () => {
  assert.strictEqual(recommendedAction('clear_no_action'), 'No write.');
  assert.match(recommendedAction('identity'), /identity/i);
  assert.match(recommendedAction('legacy_purchaser'), /Do not invent/);
});

if (failed) {
  console.error(`\nverify-reader-lifecycle-workbench: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nverify-reader-lifecycle-workbench: ${passed} passed`);
