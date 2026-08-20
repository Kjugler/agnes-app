// Admin funnel report — aggregates Event rows + Purchase / ReferralConversion / Ledger / outreach.

const { FUNNEL_EVENT_TYPES, FUNNEL_EVENT_TYPE_SET } = require('./funnelEventTypes.cjs');

const REPORT_TIME_ZONE = 'America/Denver';

const denverPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function denverParts(utcMs) {
  const parts = denverPartsFormatter.formatToParts(new Date(utcMs));
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * Instant for a civil datetime in America/Denver (handles MST/MDT).
 */
function denverCivilToUtcMs(year, month, day, hour, minute, second, ms) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  for (let i = 0; i < 8; i += 1) {
    const p = denverParts(utc);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = desired - actual;
    if (delta === 0) break;
    utc += delta;
  }
  return utc - (utc % 1000) + ms;
}

/**
 * Parse a report day bound in America/Denver.
 * start → 00:00:00.000 Denver; end → 23:59:59.999 Denver (entire selected day).
 */
function parseDay(s, which) {
  if (!s) return null;
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    if (which === 'end') {
      return new Date(denverCivilToUtcMs(year, month, day, 23, 59, 59, 999));
    }
    return new Date(denverCivilToUtcMs(year, month, day, 0, 0, 0, 0));
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function countByType(rows) {
  const map = {};
  for (const row of rows) {
    map[row.type] = (map[row.type] || 0) + 1;
  }
  return map;
}

function eventVisitorId(event) {
  const vid = event.meta?.visitorId;
  return vid ? String(vid) : null;
}

function uniqueVisitorCount(events, predicate) {
  const ids = new Set();
  for (const e of events) {
    if (predicate && !predicate(e)) continue;
    const vid = eventVisitorId(e);
    if (vid) ids.add(vid);
  }
  return ids.size;
}

function isAdAttributedPageView(event) {
  if (event.type !== FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW) return false;
  const m = event.meta || {};
  return Boolean(
    m.utm_source ||
      m.utm_medium ||
      m.utm_campaign ||
      m.fbclid ||
      m.src === 'ad' ||
      m.origin === 'meta' ||
      m.origin === 'tiktok',
  );
}

function chapterOpenCounts(events) {
  const out = { '1': 0, '2': 0, '9': 0, '45': 0 };
  for (const e of events) {
    if (e.type !== FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN) continue;
    const id = e.meta?.chapterId != null ? String(e.meta.chapterId) : '';
    if (Object.prototype.hasOwnProperty.call(out, id)) out[id] += 1;
  }
  return out;
}

function scrollDepthBreakdown(events) {
  const out = { 25: 0, 50: 0, 75: 0, 100: 0 };
  for (const e of events) {
    if (e.type !== FUNNEL_EVENT_TYPES.READERS_AGREE_SCROLL_DEPTH) continue;
    const depth = Number(e.meta?.depthPercent);
    if (Object.prototype.hasOwnProperty.call(out, depth)) out[depth] += 1;
  }
  return out;
}

function medianTimeOnPage(events) {
  const times = events
    .filter((e) => e.type === FUNNEL_EVENT_TYPES.READERS_AGREE_TIME_ON_PAGE)
    .map((e) => Number(e.meta?.secondsOnPage))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  if (times.length === 0) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 === 0 ? Math.round((times[mid - 1] + times[mid]) / 2) : times[mid];
}

function eventStage(events, { key, label, type, note, extraPredicate }) {
  const predicate = (e) => e.type === type && (!extraPredicate || extraPredicate(e));
  return {
    key,
    label,
    count: events.filter(predicate).length,
    uniqueVisitors: uniqueVisitorCount(events, predicate),
    unit: 'events',
    note,
  };
}

function tableStage({ key, label, count, unit, note, authoritative }) {
  return {
    key,
    label,
    count,
    uniqueVisitors: null,
    unit,
    note,
    authoritative: Boolean(authoritative),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function buildFunnelReport(prisma, { start, end }) {
  const now = new Date();
  const rangeEnd = end || now;
  const rangeStart =
    start || new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const funnelTypes = Array.from(FUNNEL_EVENT_TYPE_SET);

  const [funnelEvents, purchases, referralConversions, textFriendLedger, outreachSentUsers] =
    await Promise.all([
      prisma.event.findMany({
        where: {
          type: { in: funnelTypes },
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { type: true, meta: true, createdAt: true, userId: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.purchase.count({
        where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      }),
      prisma.referralConversion.count({
        where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      }),
      prisma.ledger.count({
        where: {
          type: 'TEXT_FRIEND_SHARED',
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      prisma.user.count({
        where: {
          readerRecommendationOutreachSentAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
    ]);

  const counts = countByType(funnelEvents);
  const chapters = chapterOpenCounts(funnelEvents);
  const get = (type) => counts[type] || 0;

  const adPredicate = isAdAttributedPageView;

  const stages = [
    {
      key: 'ad_attributed',
      label: 'Ad-attributed Readers Agree views',
      count: funnelEvents.filter(adPredicate).length,
      uniqueVisitors: uniqueVisitorCount(funnelEvents, adPredicate),
      unit: 'events',
      note: 'Raw page views (not unique people) with utm_*, fbclid, src=ad, or origin=meta|tiktok on that view',
    },
    eventStage(funnelEvents, {
      key: 'readers_agree_view',
      label: 'Readers Agree — page viewed',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW,
      note: 'Raw page loads, not unique people',
    }),
    eventStage(funnelEvents, {
      key: 'readers_agree_amazon',
      label: 'Readers Agree — Amazon Reviews clicked',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK,
      note: 'Raw clicks; landing + mobile bridge can both fire for one person',
    }),
    eventStage(funnelEvents, {
      key: 'readers_agree_bn',
      label: 'Readers Agree — B&N Reviews clicked',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK,
      note: 'Raw clicks; landing + mobile bridge can both fire for one person',
    }),
    eventStage(funnelEvents, {
      key: 'readers_agree_buy_direct',
      label: 'Readers Agree — Buy Direct clicked',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_DIRECT_CLICK,
      note: 'Current v2 CTA to /catalog. Does not include legacy Buy the Book clicks.',
    }),
    eventStage(funnelEvents, {
      key: 'readers_agree_email_submitted',
      label: 'Readers Agree — Email submitted',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
      note: 'Current v2 Start Reading capture (landing). Bridge email is in Event breakdown.',
    }),
    eventStage(funnelEvents, {
      key: 'sample_chapters_view',
      label: 'Sample Chapters — page viewed',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_PAGE_VIEW,
      note: 'Hub loads from all entry paths, not only Readers Agree',
    }),
    eventStage(funnelEvents, {
      key: 'sample_chapter_1',
      label: 'Sample Chapters — Chapter 1 opened',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
      extraPredicate: (e) => String(e.meta?.chapterId) === '1',
      note: 'Raw opens (return/remount counts again), not unique people',
    }),
    eventStage(funnelEvents, {
      key: 'sample_chapter_2',
      label: 'Sample Chapters — Chapter 2 opened',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
      extraPredicate: (e) => String(e.meta?.chapterId) === '2',
      note: 'Raw opens, not unique people',
    }),
    eventStage(funnelEvents, {
      key: 'sample_chapter_9',
      label: 'Sample Chapters — Chapter 9 opened',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
      extraPredicate: (e) => String(e.meta?.chapterId) === '9',
      note: 'Raw opens, not unique people',
    }),
    eventStage(funnelEvents, {
      key: 'sample_chapter_45',
      label: 'Sample Chapters — Chapter 45 opened',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
      extraPredicate: (e) => String(e.meta?.chapterId) === '45',
      note: 'Raw opens, not unique people',
    }),
    eventStage(funnelEvents, {
      key: 'sample_buy_click',
      label: 'Sample Chapters — Buy Book clicked',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK,
    }),
    eventStage(funnelEvents, {
      key: 'sample_hub_click',
      label: 'Sample Chapters — Back to Hub tapped',
      type: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_HUB_CLICK,
      note: 'Back button on the sample-chapters hub, not “entered hub”',
    }),
    eventStage(funnelEvents, {
      key: 'catalog_page_view',
      label: 'Catalog — page viewed',
      type: FUNNEL_EVENT_TYPES.CATALOG_PAGE_VIEW,
    }),
    eventStage(funnelEvents, {
      key: 'catalog_buy_click',
      label: 'Catalog — purchase CTA clicked',
      type: FUNNEL_EVENT_TYPES.CATALOG_BUY_CLICK,
      note: 'Product CTA on /catalog before Stripe checkout',
    }),
    eventStage(funnelEvents, {
      key: 'checkout_started',
      label: 'Checkout started',
      type: FUNNEL_EVENT_TYPES.CHECKOUT_STARTED,
      note: 'Attempt fired before Stripe session create; includes retries and abandoned checkouts',
    }),
    tableStage({
      key: 'purchase_recorded',
      label: 'Purchase recorded (server)',
      count: purchases,
      unit: 'purchases',
      authoritative: true,
      note: 'Authoritative sales metric. Stripe webhook Purchase rows (unique session). Not a visitor count.',
    }),
    eventStage(funnelEvents, {
      key: 'purchase_success_page',
      label: 'Purchase success page viewed',
      type: FUNNEL_EVENT_TYPES.PURCHASE_COMPLETED,
      note: 'Client success-page event only. Not the source of truth for sales.',
    }),
    tableStage({
      key: 'recommendation_email_sent',
      label: 'Recommendation email sent',
      count: outreachSentUsers,
      unit: 'users',
      note: 'Users whose last recommendation-email timestamp falls in range. Not a visitor count.',
    }),
    tableStage({
      key: 'text_a_friend',
      label: 'SMS composer opened',
      count: textFriendLedger,
      unit: 'ledger_rows',
      note: 'Ledger TEXT_FRIEND_SHARED — composer opened, not proof an SMS was sent. Not a visitor count.',
    }),
    tableStage({
      key: 'referral_purchase',
      label: 'Referral purchase attributed',
      count: referralConversions,
      unit: 'referral_conversions',
      note: 'ReferralConversion rows (unique Stripe session). Not a visitor count.',
    }),
  ];

  const historicalStages = [
    eventStage(funnelEvents, {
      key: 'legacy_buy_click',
      label: 'Readers Agree — Buy the Book clicked (legacy)',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK,
      note: 'Historical only. Not a current v2 CTA.',
    }),
    eventStage(funnelEvents, {
      key: 'legacy_sample_click',
      label: 'Readers Agree — Sample Chapters clicked (legacy)',
      type: FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK,
      note: 'Historical only. Current sample entry is Email submitted.',
    }),
  ];

  return {
    ok: true,
    range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
      timeZone: REPORT_TIME_ZONE,
    },
    stages,
    historicalStages,
    engagement: {
      readersAgreeScrollDepth: scrollDepthBreakdown(funnelEvents),
      readersAgreeMedianSecondsOnPage: medianTimeOnPage(funnelEvents),
      readersAgreeTimeOnPageEvents: get(FUNNEL_EVENT_TYPES.READERS_AGREE_TIME_ON_PAGE),
    },
    eventBreakdown: counts,
    chapterOpens: chapters,
    downstream: {
      purchases,
      referralConversions,
      textFriendShared: textFriendLedger,
      recommendationEmailsSent: outreachSentUsers,
    },
  };
}

module.exports = {
  buildFunnelReport,
  parseDay,
  REPORT_TIME_ZONE,
  eventVisitorId,
  uniqueVisitorCount,
  isAdAttributedPageView,
};
