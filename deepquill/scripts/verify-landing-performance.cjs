#!/usr/bin/env node
/**
 * Landing-page attribution and report classification.
 * No database, no network, no purchases are created.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { FUNNEL_EVENT_TYPES: T } = require('../lib/funnel/funnelEventTypes.cjs');
const {
  resolveEntryLanding,
  buildLandingPerformance,
  isCheerSource,
  CLICK_ID_KEYS,
} = require('../lib/funnel/landingAttribution.cjs');
const { buildFunnelReport, isLandingEmail } = require('../lib/funnel/buildFunnelReport.cjs');

const t0 = new Date('2026-11-01T18:00:00.000Z');
const t1 = new Date('2026-11-01T18:05:00.000Z');
const t2 = new Date('2026-11-01T18:10:00.000Z');
const t3 = new Date('2026-11-01T18:15:00.000Z');

function ev(type, meta, createdAt) {
  return { type, meta, createdAt };
}

assert.deepStrictEqual(
  resolveEntryLanding({ stored: '/readers-agree', source: 'readers-cheer', explicit: '/readers-cheer' }),
  { entryPage: '/readers-agree', persist: null },
);
assert.deepStrictEqual(resolveEntryLanding({ source: 'readers-cheer' }), {
  entryPage: '/readers-cheer',
  persist: '/readers-cheer',
});
assert.strictEqual(resolveEntryLanding({ source: 'catalog' }).entryPage, null);

const secretClick = 'gclid-secret-value-should-not-leak';
const agreeVisitor = 'visitor-agree';
const cheerVisitor = 'visitor-cheer';
const wonderVisitor = 'visitor-wonder';
const sampleVisitor = 'visitor-sample';
const bothVisitor = 'visitor-both';

const events = [
  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: agreeVisitor, source: 'readers-agree', path: '/readers-agree', utm_source: 'meta', utm_campaign: 'fall', gclid: secretClick }, t0),
  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: agreeVisitor, source: 'readers-agree', path: '/readers-agree', utm_source: 'meta', utm_campaign: 'fall' }, new Date(t0.getTime() + 1000)),
  ev(T.SAMPLE_CHAPTER_OPEN, { visitorId: agreeVisitor, source: 'sample-chapter-reader', chapterId: '1', path: '/sample-chapters/read/1', entryPage: '/readers-agree' }, t1),
  ev(T.READERS_AGREE_EMAIL_SUBMITTED, { visitorId: agreeVisitor, source: 'server', captureSurface: 'landing' }, t1),
  ev(T.CATALOG_PAGE_VIEW, { visitorId: agreeVisitor, source: 'catalog', path: '/catalog', entryPage: '/readers-agree' }, t2),
  ev(T.CHECKOUT_STARTED, { visitorId: agreeVisitor, source: 'catalog', path: '/checkout', entryPage: '/readers-agree' }, t2),
  ev(T.PURCHASE_COMPLETED, { visitorId: agreeVisitor, source: 'checkout-success', session_id: 'cs_agree', path: '/checkout/success', entryPage: '/readers-agree' }, t3),

  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: cheerVisitor, source: 'readers-cheer', entryPage: '/readers-cheer', path: '/readers-cheer?utm_source=tiktok', utm_source: 'tiktok', utm_campaign: 'cheer-camp' }, t0),
  ev(T.READERS_AGREE_AMAZON_CLICK, { visitorId: cheerVisitor, source: 'readers-cheer', entryPage: '/readers-cheer' }, t1),
  ev(T.READERS_AGREE_EMAIL_SUBMITTED, { visitorId: cheerVisitor, source: 'server', captureSurface: 'cheer', entryPage: '/readers-cheer' }, t1),
  ev(T.MARKETING_CONSENT_GRANTED, { visitorId: cheerVisitor, source: 'server', captureSurface: 'cheer', entryPage: '/readers-cheer', explicit: true }, t1),

  ev(T.WORLD_WONDERING_PAGE_VIEW, { visitorId: wonderVisitor, source: 'world-wondering', path: '/world-wondering' }, t0),
  ev(T.READERS_AGREE_AMAZON_CLICK, { visitorId: wonderVisitor, source: 'world-wondering', destination: 'amazon' }, t1),
  ev(T.READERS_AGREE_BN_CLICK, { visitorId: wonderVisitor, source: 'world-wondering', destination: 'bn' }, t1),
  ev(T.WORLD_WONDERING_SAMPLE_CHAPTERS_CLICK, { visitorId: wonderVisitor, source: 'world-wondering' }, t1),
  ev(T.WORLD_WONDERING_CATALOG_CLICK, { visitorId: wonderVisitor, source: 'world-wondering' }, t2),
  ev(T.CATALOG_PAGE_VIEW, { visitorId: wonderVisitor, source: 'catalog', path: '/catalog', entryPage: '/world-wondering' }, t2),

  ev(T.SAMPLE_CHAPTERS_PAGE_VIEW, { visitorId: sampleVisitor, source: 'sample-chapters', path: '/sample-chapters' }, t0),
  ev(T.SAMPLE_CHAPTER_OPEN, { visitorId: sampleVisitor, source: 'sample-chapter-reader', chapterId: '2', entryPage: '/sample-chapters' }, t1),

  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: bothVisitor, source: 'readers-agree', path: '/readers-agree' }, t0),
  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: bothVisitor, source: 'readers-cheer', entryPage: '/readers-agree', path: '/readers-cheer' }, t2),

  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: 'visitor-return', source: 'readers-agree', path: '/readers-agree', utm_source: 'meta', utm_campaign: 'fall' }, t0),
  ev(T.CATALOG_PAGE_VIEW, { visitorId: 'visitor-return', source: 'catalog', path: '/catalog', entryPage: '/readers-agree' }, t1),
  ev(T.WORLD_WONDERING_PAGE_VIEW, { visitorId: 'visitor-return', source: 'world-wondering', path: '/world-wondering', utm_source: 'google', utm_campaign: 'spring', entryPage: '/world-wondering' }, new Date('2026-11-02T02:00:00.000Z')),
  ev(T.CATALOG_PAGE_VIEW, { visitorId: 'visitor-return', source: 'catalog', path: '/catalog', entryPage: '/world-wondering' }, new Date('2026-11-02T02:05:00.000Z')),
  ev(T.CHECKOUT_STARTED, { visitorId: 'visitor-return', source: 'catalog', path: '/checkout', entryPage: '/world-wondering' }, new Date('2026-11-02T02:06:00.000Z')),
  ev(T.PURCHASE_COMPLETED, { visitorId: 'visitor-return', source: 'checkout-success', session_id: 'cs_return', path: '/checkout/success', entryPage: '/world-wondering' }, new Date('2026-11-02T02:10:00.000Z')),
  ev(T.READERS_AGREE_PAGE_VIEW, { visitorId: 'visitor-gap', source: 'readers-agree', path: '/readers-agree' }, t0),
  ev(T.CATALOG_PAGE_VIEW, { visitorId: 'visitor-gap', source: 'catalog', path: '/catalog' }, new Date('2026-11-02T03:00:00.000Z')),
  ev(T.SAMPLE_CHAPTER_OPEN, { visitorId: 'visitor-internal', source: 'sample-chapter-reader', chapterId: '1', entryPage: '/readers-agree' }, t2),
  ev(T.SAMPLE_CHAPTERS_PAGE_VIEW, { visitorId: 'visitor-internal', source: 'sample-chapters', path: '/sample-chapters', entryPage: '/readers-agree' }, t1),

  ev(T.CATALOG_PAGE_VIEW, { visitorId: 'visitor-unknown', source: 'catalog', path: '/catalog' }, t0),
  ev(T.READERS_AGREE_BUY_CLICK, { visitorId: 'visitor-legacy', source: 'readers-agree' }, t0),
  ev(T.PURCHASE_COMPLETED, { visitorId: 'visitor-orphan', source: 'checkout-success', session_id: 'cs_missing_purchase' }, t3),
];

const purchases = [
  { sessionId: 'cs_agree', createdAt: t3 },
  { sessionId: 'cs_unlinked', createdAt: t3 },
  { sessionId: 'cs_return', createdAt: new Date('2026-11-02T02:10:00.000Z') },
];

const performance = buildLandingPerformance(events, purchases);
const encoded = JSON.stringify(performance);
for (const key of CLICK_ID_KEYS) {
  assert.ok(!encoded.includes(secretClick), `${key} value leaked into the report`);
}
assert.ok(!encoded.includes('gclid'));

const byKey = Object.fromEntries(performance.pages.map((page) => [page.key, page]));
const metric = (page, key) => page.metrics.find((row) => row.key === key);

assert.strictEqual(metric(byKey['readers-agree'], 'page_views').uniqueVisitors, 4);
assert.strictEqual(metric(byKey['readers-cheer'], 'page_views').uniqueVisitors, 2);
assert.strictEqual(metric(byKey['readers-agree'], 'page_views').raw, 5);
assert.strictEqual(metric(byKey['readers-cheer'], 'email').uniqueVisitors, 1);
assert.strictEqual(metric(byKey['readers-agree'], 'email').uniqueVisitors, 1);
assert.strictEqual(metric(byKey['readers-cheer'], 'amazon').raw, 1);
assert.strictEqual(metric(byKey['readers-agree'], 'amazon').raw, 0);
assert.strictEqual(metric(byKey['world-wondering'], 'amazon').raw, 1);
assert.strictEqual(metric(byKey['world-wondering'], 'bn').raw, 1);
assert.strictEqual(metric(byKey['world-wondering'], 'sample_clicks').raw, 1);
assert.strictEqual(metric(byKey['world-wondering'], 'catalog').uniqueVisitors, 2);
assert.strictEqual(metric(byKey['readers-agree'], 'catalog').uniqueVisitors, 2);
assert.strictEqual(metric(byKey['sample-chapters'], 'reading').uniqueVisitors, 1);
assert.strictEqual(metric(byKey['readers-agree'], 'reading').uniqueVisitors, 2);
assert.strictEqual(metric(byKey['readers-agree'], 'verified_purchases').raw, 1);
assert.strictEqual(metric(byKey['world-wondering'], 'verified_purchases').raw, 1);
assert.strictEqual(metric(byKey['readers-cheer'], 'verified_purchases').raw, 0);
assert.strictEqual(metric(byKey['readers-cheer'], 'marketing_consent').raw, 1);
assert.strictEqual(byKey['readers-cheer'].rates.verifiedPurchase.display, 'Not attributable');
assert.ok(byKey['readers-agree'].rates.verifiedPurchase.display.startsWith('25%'));
assert.strictEqual(byKey['readers-agree'].rates.sampleEngagement.numerator, 2);
assert.strictEqual(byKey['readers-agree'].rates.sampleEngagement.denominator, 4);

assert.strictEqual(performance.overview.uniqueVisitors, 8);
assert.ok(performance.overview.uniqueVisitors < 4 + 2 + 2 + 2);
assert.strictEqual(performance.overview.verifiedDirectPurchases, 3);
assert.strictEqual(performance.overview.attributedVerifiedPurchases, 2);
assert.strictEqual(performance.overview.unattributedVerifiedPurchases, 1);
assert.strictEqual(performance.diagnostics.unknownVisitActivity, 3);
assert.strictEqual(performance.overview.unknownVisitors, 2);
assert.strictEqual(performance.diagnostics.duplicateSubmissions, 1);
assert.strictEqual(performance.diagnostics.legacyEvents.READERS_AGREE_BUY_CLICK, 1);
assert.ok(performance.diagnostics.unmatchedPurchases >= 1);

const agreeCampaign = byKey['readers-agree'].campaigns.find((row) => row.campaign === 'fall');
assert.ok(agreeCampaign);
assert.strictEqual(agreeCampaign.source, 'meta');
assert.ok(!JSON.stringify(agreeCampaign).includes(secretClick));
const clickOnly = byKey['readers-agree'].campaigns.find((row) => row.source === 'Advertising click id');
assert.strictEqual(clickOnly, undefined);

assert.strictEqual(isCheerSource(events.find((event) => event.meta.visitorId === cheerVisitor && event.type === T.READERS_AGREE_PAGE_VIEW)), true);
assert.strictEqual(isLandingEmail(events.find((event) => event.meta.captureSurface === 'cheer')), false);
assert.strictEqual(isLandingEmail(events.find((event) => event.meta.captureSurface === 'landing')), true);

function fakePrisma() {
  return {
    event: { findMany: async () => events },
    purchase: {
      findMany: async () => purchases,
      count: async () => purchases.length,
    },
    referralConversion: { count: async () => 0 },
    ledger: { count: async () => 0 },
    user: { count: async () => 0 },
  };
}

buildFunnelReport(fakePrisma(), { start: new Date('2026-11-01T00:00:00.000Z'), end: new Date('2026-11-02T00:00:00.000Z') }).then((report) => {
  const stage = (key) => report.stages.find((row) => row.key === key);
  assert.strictEqual(stage('readers_agree_view').count, 5);
  assert.strictEqual(stage('readers_agree_amazon').count, 0);
  assert.strictEqual(stage('purchase_recorded').count, 3);
  assert.strictEqual(stage('purchase_recorded').authoritative, true);
  assert.strictEqual(report.historicalStages.find((row) => row.key === 'legacy_buy_click').count, 1);
  assert.ok(report.landingPerformance.pages.length === 4);
  const client = fs.readFileSync(path.join(__dirname, '../../agnes-next/src/lib/funnelTracking.ts'), 'utf8');
  const visit = fs.readFileSync(path.join(__dirname, '../../agnes-next/src/lib/funnelVisit.ts'), 'utf8');
  assert.ok(client.includes("params.get('ref') || params.get('code')"));
  assert.ok(client.includes('ap_funnel_entry'));
  assert.ok(client.includes('ap_funnel_visit'));
  assert.ok(client.includes('advertisingClickIdsPermitted'));
  assert.ok(visit.includes('gclid'));
  assert.ok(visit.includes('msclkid'));
  assert.ok(visit.includes('ttclid'));
  assert.ok(visit.includes('utm_content'));
  assert.ok(visit.includes('VISIT_GAP_MS'));
  const checkout = fs.readFileSync(path.join(__dirname, '../../agnes-next/src/lib/checkout.ts'), 'utf8');
  assert.ok(!checkout.includes('gclid'));
  assert.ok(!checkout.includes('msclkid'));
  assert.ok(!checkout.includes('ttclid'));
  console.log('verify-landing-performance: ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
