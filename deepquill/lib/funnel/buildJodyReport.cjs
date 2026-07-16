// Jody Concierge dashboard — funnel counts + step conversion rates.

const { FUNNEL_EVENT_TYPES } = require('./funnelEventTypes.cjs');
const { parseDay } = require('./buildFunnelReport.cjs');

/** Default min dwell (seconds) — matches agnes-next jodyConcierge.ts default. */
const DEFAULT_CHAPTER1_FINISH_SECONDS = 90;

function eventVisitorId(event) {
  const vid = event.meta?.visitorId;
  return vid ? String(vid) : null;
}

function eventIdentityKey(event) {
  if (event.userId) return `u:${event.userId}`;
  const uid = event.meta?.userId;
  if (uid) return `u:${uid}`;
  const vid = eventVisitorId(event);
  if (vid) return `v:${vid}`;
  return null;
}

function uniqueCount(events, type, predicate = () => true) {
  const ids = new Set();
  for (const e of events) {
    if (e.type !== type) continue;
    if (!predicate(e)) continue;
    const key = eventIdentityKey(e);
    if (key) ids.add(key);
  }
  return ids.size;
}

/** Email steps: prefer userId (server-recorded) to avoid double-counting with visitorId. */
function uniqueEmailStepCount(events, type) {
  const userIds = new Set();
  const visitorIds = new Set();
  for (const e of events) {
    if (e.type !== type) continue;
    if (e.userId) {
      userIds.add(String(e.userId));
      continue;
    }
    const metaUserId = e.meta?.userId;
    if (metaUserId) {
      userIds.add(String(metaUserId));
      continue;
    }
    const vid = eventVisitorId(e);
    if (vid) visitorIds.add(vid);
  }
  if (userIds.size > 0) return userIds.size;
  return visitorIds.size;
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Readers who likely finished Chapter 1: min dwell on TIME_ON_PAGE or explicit JODY_CHAPTER_COMPLETED.
 */
function countChapter1Finished(events, minSeconds) {
  const fromJody = uniqueCount(
    events,
    FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED,
    (e) => String(e.meta?.chapterId) === '1',
  );
  if (fromJody > 0) return { count: fromJody, basis: 'JODY_CHAPTER_COMPLETED' };

  const ids = new Set();
  for (const e of events) {
    if (e.type !== FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE) continue;
    if (String(e.meta?.chapterId) !== '1') continue;
    const seconds = Number(e.meta?.secondsOnPage);
    if (!Number.isFinite(seconds) || seconds < minSeconds) continue;
    const key = eventIdentityKey(e);
    if (key) ids.add(key);
  }
  return {
    count: ids.size,
    basis: `SAMPLE_CHAPTER_TIME_ON_PAGE (≥${minSeconds}s on Chapter 1)`,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function buildJodyReport(prisma, { start, end, chapter1MinSeconds = DEFAULT_CHAPTER1_FINISH_SECONDS }) {
  const now = new Date();
  const rangeEnd = end || now;
  const rangeStart =
    start || new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const jodyTypes = [
    FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED,
    FUNNEL_EVENT_TYPES.JODY_APPEAR,
    FUNNEL_EVENT_TYPES.JODY_REMEMBER_PLACE_ACCEPT,
    FUNNEL_EVENT_TYPES.JODY_REMEMBER_PLACE_DECLINE,
    FUNNEL_EVENT_TYPES.JODY_EMAIL_ENTERED,
    FUNNEL_EVENT_TYPES.JODY_EMAIL_VERIFIED,
    FUNNEL_EVENT_TYPES.JODY_UPDATES_ACCEPT,
    FUNNEL_EVENT_TYPES.JODY_UPDATES_DECLINE,
    FUNNEL_EVENT_TYPES.RETURNED_WITH_JODY,
    FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
  ];

  const events = await prisma.event.findMany({
    where: {
      type: { in: jodyTypes },
      createdAt: { gte: rangeStart, lte: rangeEnd },
    },
    select: { type: true, meta: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const chapter1Finished = countChapter1Finished(events, chapter1MinSeconds);

  const metrics = {
    chapter1Finished: chapter1Finished.count,
    jodyAppeared: uniqueCount(events, FUNNEL_EVENT_TYPES.JODY_APPEAR),
    rememberPlaceClicked: uniqueCount(events, FUNNEL_EVENT_TYPES.JODY_REMEMBER_PLACE_ACCEPT),
    rememberPlaceDeclined: uniqueCount(events, FUNNEL_EVENT_TYPES.JODY_REMEMBER_PLACE_DECLINE),
    emailEntered: uniqueEmailStepCount(events, FUNNEL_EVENT_TYPES.JODY_EMAIL_ENTERED),
    emailVerified: uniqueEmailStepCount(events, FUNNEL_EVENT_TYPES.JODY_EMAIL_VERIFIED),
    updatesAccepted: uniqueCount(events, FUNNEL_EVENT_TYPES.JODY_UPDATES_ACCEPT),
    updatesDeclined: uniqueCount(events, FUNNEL_EVENT_TYPES.JODY_UPDATES_DECLINE),
    returnedReaders: uniqueCount(events, FUNNEL_EVENT_TYPES.RETURNED_WITH_JODY),
  };

  const funnel = [
    {
      key: 'chapter1Finished',
      label: 'Readers finishing Chapter 1',
      count: metrics.chapter1Finished,
      conversionFromPrevious: null,
      conversionFromTop: pct(metrics.chapter1Finished, metrics.chapter1Finished),
    },
    {
      key: 'jodyAppeared',
      label: 'Jody appeared',
      count: metrics.jodyAppeared,
      conversionFromPrevious: pct(metrics.jodyAppeared, metrics.chapter1Finished),
      conversionFromTop: pct(metrics.jodyAppeared, metrics.chapter1Finished),
    },
    {
      key: 'rememberPlaceClicked',
      label: 'Remember My Place clicked',
      count: metrics.rememberPlaceClicked,
      conversionFromPrevious: pct(metrics.rememberPlaceClicked, metrics.jodyAppeared),
      conversionFromTop: pct(metrics.rememberPlaceClicked, metrics.chapter1Finished),
    },
    {
      key: 'emailEntered',
      label: 'Email entered',
      count: metrics.emailEntered,
      conversionFromPrevious: pct(metrics.emailEntered, metrics.rememberPlaceClicked),
      conversionFromTop: pct(metrics.emailEntered, metrics.chapter1Finished),
    },
    {
      key: 'emailVerified',
      label: 'Email verified',
      count: metrics.emailVerified,
      conversionFromPrevious: pct(metrics.emailVerified, metrics.emailEntered),
      conversionFromTop: pct(metrics.emailVerified, metrics.chapter1Finished),
    },
    {
      key: 'updatesAccepted',
      label: 'Updates accepted',
      count: metrics.updatesAccepted,
      conversionFromPrevious: pct(metrics.updatesAccepted, metrics.emailVerified),
      conversionFromTop: pct(metrics.updatesAccepted, metrics.chapter1Finished),
    },
    {
      key: 'returnedReaders',
      label: 'Returned readers',
      count: metrics.returnedReaders,
      conversionFromPrevious: null,
      conversionFromTop: pct(metrics.returnedReaders, metrics.emailVerified),
    },
  ];

  return {
    ok: true,
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    metrics,
    funnel,
    notes: {
      chapter1FinishedBasis: chapter1Finished.basis,
      identityBasis:
        'Unique visitors (ap_funnel_vid) or users (contest userId) per step; server-recorded for email entered/verified.',
      trustNote:
        'Declines and drop-offs are expected — optimize for verified email quality, not raw popup volume.',
      readerStatusLifecycle:
        'UNKNOWN → READING → KNOWN → RETURNING → PURCHASER (see readerStatus config)',
      plannedEngagementMetrics: [
        'averageMinutesReading',
        'averageChaptersRead',
        'mostCommonExitChapter',
        'returnRate',
        'averageDaysUntilReturn',
      ],
    },
  };
}

module.exports = {
  buildJodyReport,
  DEFAULT_CHAPTER1_FINISH_SECONDS,
  parseDay,
};
