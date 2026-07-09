// Content performance report — chapter reads + Readers Agree CTA conversion.

const { FUNNEL_EVENT_TYPES } = require('./funnelEventTypes.cjs');
const { parseDay } = require('./buildFunnelReport.cjs');

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function eventVisitorId(event) {
  const vid = event.meta?.visitorId;
  return vid ? String(vid) : null;
}

function firstTouchByVisitor(events) {
  /** @type {Map<string, Date>} */
  const map = new Map();
  for (const e of events) {
    const vid = eventVisitorId(e);
    if (!vid) continue;
    const existing = map.get(vid);
    if (!existing || e.createdAt < existing) {
      map.set(vid, e.createdAt);
    }
  }
  return map;
}

function buildPurchaseIndex(events) {
  /** @type {Map<string, Date[]>} */
  const byVisitor = new Map();
  for (const e of events) {
    if (e.type !== FUNNEL_EVENT_TYPES.PURCHASE_COMPLETED) continue;
    const vid = eventVisitorId(e);
    if (!vid) continue;
    if (!byVisitor.has(vid)) byVisitor.set(vid, []);
    byVisitor.get(vid).push(e.createdAt);
  }
  for (const times of byVisitor.values()) {
    times.sort((a, b) => a - b);
  }
  return byVisitor;
}

function countPurchasedAfter(firstTouch, purchaseIndex) {
  let purchased = 0;
  for (const [vid, touchAt] of firstTouch) {
    const purchases = purchaseIndex.get(vid);
    if (!purchases) continue;
    if (purchases.some((t) => t >= touchAt)) purchased += 1;
  }
  return purchased;
}

function averageSeconds(events, predicate) {
  const values = events
    .filter(predicate)
    .map((e) => Number(e.meta?.secondsOnPage))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function buildContentReport(prisma, { start, end }) {
  const now = new Date();
  const rangeEnd = end || now;
  const rangeStart =
    start || new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const reportTypes = [
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
    FUNNEL_EVENT_TYPES.PURCHASE_COMPLETED,
    FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK,
    FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK,
    FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK,
  ];

  const events = await prisma.event.findMany({
    where: {
      type: { in: reportTypes },
      createdAt: { gte: rangeStart, lte: rangeEnd },
    },
    select: { type: true, meta: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const purchaseIndex = buildPurchaseIndex(events);

  const chapterOrder = ['1', '2', '9', '45'];
  const chapters = chapterOrder.map((chapterId) => {
    const opens = events.filter(
      (e) =>
        e.type === FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN &&
        String(e.meta?.chapterId) === chapterId,
    );
    const firstTouch = firstTouchByVisitor(opens);
    const opened = firstTouch.size;
    const purchased = countPurchasedAfter(firstTouch, purchaseIndex);
    const avgSeconds = averageSeconds(
      events,
      (e) =>
        e.type === FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE &&
        String(e.meta?.chapterId) === chapterId,
    );

    return {
      chapterId,
      label: `Chapter ${chapterId}`,
      opened,
      averageSeconds: avgSeconds,
      averageTime: formatDuration(avgSeconds),
      purchased,
      conversionPercent: pct(purchased, opened),
    };
  });

  const ctaDefinitions = [
    {
      key: 'amazon',
      label: 'Amazon Reviews',
      clickType: FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK,
    },
    {
      key: 'bn',
      label: 'Barnes & Noble Reviews',
      clickType: FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK,
    },
    {
      key: 'sample_chapters',
      label: 'Sample Chapters',
      clickType: FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK,
    },
  ];

  const readersAgreeCtas = ctaDefinitions.map((cta) => {
    const clicks = events.filter((e) => e.type === cta.clickType);
    const firstTouch = firstTouchByVisitor(clicks);
    const clicked = firstTouch.size;
    const purchased = countPurchasedAfter(firstTouch, purchaseIndex);

    return {
      key: cta.key,
      label: cta.label,
      clicked,
      purchased,
      conversionPercent: pct(purchased, clicked),
    };
  });

  return {
    ok: true,
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    chapters,
    readersAgreeCtas,
    notes: {
      conversionBasis:
        'Purchases matched by ap_funnel_vid: PURCHASE_COMPLETED after first open/click in range.',
      averageTimeBasis: 'Mean SAMPLE_CHAPTER_TIME_ON_PAGE events per chapter (exit/visibility flush).',
    },
  };
}

module.exports = {
  buildContentReport,
  formatDuration,
  parseDay,
};
