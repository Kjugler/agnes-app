// Admin funnel report — aggregates Event rows + Purchase / ReferralConversion / Ledger / outreach.

const { FUNNEL_EVENT_TYPES, FUNNEL_EVENT_TYPE_SET } = require('./funnelEventTypes.cjs');

function parseDay(s, which) {
  if (!s) return null;
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return which === 'end' ? new Date(`${str}T23:59:59.999Z`) : new Date(`${str}T00:00:00.000Z`);
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

function chapterOpenCounts(events) {
  const out = { '1': 0, '2': 0, '9': 0, '45': 0 };
  for (const e of events) {
    if (e.type !== FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN) continue;
    const id = e.meta?.chapterId != null ? String(e.meta.chapterId) : '';
    if (Object.prototype.hasOwnProperty.call(out, id)) out[id] += 1;
  }
  return out;
}

function adAttributedViews(events) {
  return events.filter((e) => {
    if (e.type !== FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW) return false;
    const m = e.meta || {};
    return Boolean(
      m.utm_source ||
        m.utm_medium ||
        m.utm_campaign ||
        m.fbclid ||
        m.src === 'ad' ||
        m.origin === 'meta' ||
        m.origin === 'tiktok',
    );
  }).length;
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

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function buildFunnelReport(prisma, { start, end }) {
  const now = new Date();
  const rangeEnd = end || now;
  const rangeStart =
    start || new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const funnelTypes = Array.from(FUNNEL_EVENT_TYPE_SET);

  const [
    funnelEvents,
    purchases,
    referralConversions,
    textFriendLedger,
    outreachSentUsers,
    checkoutStartedEvents,
    purchaseCompletedEvents,
  ] = await Promise.all([
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
    prisma.event.count({
      where: {
        type: FUNNEL_EVENT_TYPES.CHECKOUT_STARTED,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
    }),
    prisma.event.count({
      where: {
        type: FUNNEL_EVENT_TYPES.PURCHASE_COMPLETED,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
    }),
  ]);

  const counts = countByType(funnelEvents);
  const chapters = chapterOpenCounts(funnelEvents);

  const get = (type) => counts[type] || 0;

  const stages = [
    {
      key: 'ad_attributed',
      label: 'Ad-attributed Readers Agree views',
      count: adAttributedViews(funnelEvents),
      note: 'Page views with utm_*, fbclid, or ad origin params',
    },
    {
      key: 'readers_agree_view',
      label: 'Readers Agree — page viewed',
      count: get(FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW),
    },
    {
      key: 'readers_agree_amazon',
      label: 'Readers Agree — Amazon Reviews clicked',
      count: get(FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK),
    },
    {
      key: 'readers_agree_bn',
      label: 'Readers Agree — B&N Reviews clicked',
      count: get(FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK),
    },
    {
      key: 'readers_agree_buy',
      label: 'Readers Agree — Buy the Book clicked',
      count: get(FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK),
    },
    {
      key: 'readers_agree_sample',
      label: 'Readers Agree — Sample Chapters clicked',
      count: get(FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK),
    },
    {
      key: 'sample_chapters_view',
      label: 'Sample Chapters — page viewed',
      count: get(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_PAGE_VIEW),
    },
    {
      key: 'sample_chapter_1',
      label: 'Sample Chapters — Chapter 1 opened',
      count: chapters['1'],
    },
    {
      key: 'sample_chapter_2',
      label: 'Sample Chapters — Chapter 2 opened',
      count: chapters['2'],
    },
    {
      key: 'sample_chapter_9',
      label: 'Sample Chapters — Chapter 9 opened',
      count: chapters['9'],
    },
    {
      key: 'sample_chapter_45',
      label: 'Sample Chapters — Chapter 45 opened',
      count: chapters['45'],
    },
    {
      key: 'sample_buy_click',
      label: 'Sample Chapters — Buy Book clicked',
      count: get(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK),
    },
    {
      key: 'sample_hub_click',
      label: 'Sample Chapters — Hub clicked',
      count: get(FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_HUB_CLICK),
    },
    {
      key: 'checkout_started',
      label: 'Checkout started',
      count: checkoutStartedEvents,
    },
    {
      key: 'purchase_completed_event',
      label: 'Purchase completed (client event)',
      count: purchaseCompletedEvents,
    },
    {
      key: 'purchase_recorded',
      label: 'Purchase recorded (server)',
      count: purchases,
    },
    {
      key: 'recommendation_email_sent',
      label: 'Recommendation email sent',
      count: outreachSentUsers,
    },
    {
      key: 'text_a_friend',
      label: 'Text a Friend (ledger)',
      count: textFriendLedger,
    },
    {
      key: 'referral_purchase',
      label: 'Referral purchase attributed',
      count: referralConversions,
    },
  ];

  return {
    ok: true,
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    stages,
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
};
