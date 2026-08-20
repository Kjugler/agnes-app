#!/usr/bin/env node
/**
 * Verify America/Denver funnel date bounds and unique-visitor helper.
 * Usage: node scripts/verify-funnel-report-bounds.cjs
 */
const assert = require('assert');
const {
  parseDay,
  REPORT_TIME_ZONE,
  uniqueVisitorCount,
  isAdAttributedPageView,
} = require('../lib/funnel/buildFunnelReport.cjs');
const { FUNNEL_EVENT_TYPES } = require('../lib/funnel/funnelEventTypes.cjs');

assert.strictEqual(REPORT_TIME_ZONE, 'America/Denver');

function iso(d) {
  return d.toISOString();
}

// 2026-08-20 is MDT (UTC-6): start 06:00Z, end 05:59:59.999Z next day
const augStart = parseDay('2026-08-20', 'start');
const augEnd = parseDay('2026-08-20', 'end');
assert.ok(augStart && augEnd);
assert.strictEqual(iso(augStart), '2026-08-20T06:00:00.000Z');
assert.strictEqual(iso(augEnd), '2026-08-21T05:59:59.999Z');

// 2026-01-15 is MST (UTC-7)
const janStart = parseDay('2026-01-15', 'start');
const janEnd = parseDay('2026-01-15', 'end');
assert.ok(janStart && janEnd);
assert.strictEqual(iso(janStart), '2026-01-15T07:00:00.000Z');
assert.strictEqual(iso(janEnd), '2026-01-16T06:59:59.999Z');

const events = [
  { type: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW, meta: { visitorId: 'a', utm_source: 'tiktok' } },
  { type: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW, meta: { visitorId: 'a', utm_source: 'tiktok' } },
  { type: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW, meta: { visitorId: 'b' } },
  { type: FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK, meta: { visitorId: 'c' } },
  { type: FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_DIRECT_CLICK, meta: { visitorId: 'd' } },
  { type: FUNNEL_EVENT_TYPES.CATALOG_PAGE_VIEW, meta: { visitorId: 'e' } },
  { type: FUNNEL_EVENT_TYPES.CATALOG_BUY_CLICK, meta: { visitorId: 'e', product: 'paperback' } },
];

assert.strictEqual(
  uniqueVisitorCount(events, (e) => e.type === FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW),
  2,
);
assert.strictEqual(events.filter(isAdAttributedPageView).length, 2);
assert.strictEqual(uniqueVisitorCount(events, isAdAttributedPageView), 1);

assert.ok(FUNNEL_EVENT_TYPES.CATALOG_PAGE_VIEW === 'CATALOG_PAGE_VIEW');
assert.ok(FUNNEL_EVENT_TYPES.CATALOG_BUY_CLICK === 'CATALOG_BUY_CLICK');

const currentCtaTypes = new Set([
  FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_DIRECT_CLICK,
  FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
]);
assert.ok(!currentCtaTypes.has(FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK));
assert.ok(!currentCtaTypes.has(FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK));

console.log('verify-funnel-report-bounds: ok');
