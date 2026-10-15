/**
 * Pure reading of server allowance facts and visit inference.
 * These event types are not in the public funnel set, so a browser
 * cannot create them through POST /api/funnel/event.
 * No Prisma, email, nurture, or consent writes.
 */

const RETURN_GAP_MS = 6 * 60 * 60 * 1000;
const QUALIFYING_MS = 90_000;
const CHAPTER_IDS = Object.freeze(['1', '2', '9', '45']);

const ALLOWANCE_EVENT = Object.freeze({
  SNAPSHOT: 'READING_ALLOWANCE_RECORDED',
  GATE_REACHED: 'READING_GATE_REACHED',
  NOT_NOW: 'READING_GATE_NOT_NOW',
  EMAIL_ACCEPTED: 'READING_GATE_EMAIL_ACCEPTED',
});

const ALLOWANCE_ENGAGEMENT_EVENT_TYPES = Object.freeze(Object.values(ALLOWANCE_EVENT));

const OUTCOME_BY_TYPE = Object.freeze({
  [ALLOWANCE_EVENT.SNAPSHOT]: 'snapshot',
  [ALLOWANCE_EVENT.GATE_REACHED]: 'gate_reached',
  [ALLOWANCE_EVENT.NOT_NOW]: 'not_now',
  [ALLOWANCE_EVENT.EMAIL_ACCEPTED]: 'email_accepted',
});

const TYPE_BY_OUTCOME = Object.freeze({
  snapshot: ALLOWANCE_EVENT.SNAPSHOT,
  gate_reached: ALLOWANCE_EVENT.GATE_REACHED,
  not_now: ALLOWANCE_EVENT.NOT_NOW,
  email_accepted: ALLOWANCE_EVENT.EMAIL_ACCEPTED,
});

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function metaOf(event) {
  const meta = event && event.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta;
}

function cappedMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(QUALIFYING_MS, Math.floor(n));
}

function factType(outcome) {
  return TYPE_BY_OUTCOME[outcome] || null;
}

function allowanceFactMeta(fact) {
  const chapters = fact && fact.chapterMs && typeof fact.chapterMs === 'object' ? fact.chapterMs : {};
  const meta = {
    allowanceSource: 'server_allowance',
    outcome: fact.outcome,
    visitorId: fact.visitorId,
    qualifyingMs: cappedMs(fact.qualifyingMs),
    chapterMs1: cappedMs(chapters['1']),
    chapterMs2: cappedMs(chapters['2']),
    chapterMs9: cappedMs(chapters['9']),
    chapterMs45: cappedMs(chapters['45']),
    page: Number.isInteger(fact.page) ? fact.page : 1,
  };
  if (fact.chapterId) meta.chapterId = String(fact.chapterId);
  return meta;
}

function readAllowanceEngagementEvent(event) {
  if (!event || !ALLOWANCE_ENGAGEMENT_EVENT_TYPES.includes(event.type)) return null;
  const meta = metaOf(event);
  if (meta.allowanceSource !== 'server_allowance') return null;
  const outcome = OUTCOME_BY_TYPE[event.type];
  if (!outcome || meta.outcome !== outcome) return null;
  const chapterMs = {
    1: cappedMs(meta.chapterMs1),
    2: cappedMs(meta.chapterMs2),
    9: cappedMs(meta.chapterMs9),
    45: cappedMs(meta.chapterMs45),
  };
  return {
    outcome,
    qualifyingMs: cappedMs(meta.qualifyingMs),
    chapterMs,
    chapterId: CHAPTER_IDS.includes(String(meta.chapterId || '')) ? String(meta.chapterId) : '',
  };
}

function eventTime(event) {
  if (!event || event.createdAt == null) return null;
  const date = event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Event timestamps are measured. A visit or session is not: Event has no
 * session id. A return is inferred only when two of this reader's events
 * are at least six hours apart.
 */
function deriveReaderActivity(events) {
  const times = [];
  for (const event of Array.isArray(events) ? events : []) {
    const at = eventTime(event);
    if (at) times.push(at);
  }
  times.sort((left, right) => left.getTime() - right.getTime());
  let inferredReturnCount = 0;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i].getTime() - times[i - 1].getTime() >= RETURN_GAP_MS) inferredReturnCount += 1;
  }
  return {
    firstActivityAt: times.length ? times[0].toISOString() : null,
    latestActivityAt: times.length ? times[times.length - 1].toISOString() : null,
    measuredSessionCount: null,
    sessionMeasurement: 'unavailable_no_session_id',
    inferredReturnCount,
    returnInference: 'gap_of_6_hours_between_events',
  };
}

module.exports = {
  RETURN_GAP_MS,
  QUALIFYING_MS,
  CHAPTER_IDS,
  ALLOWANCE_EVENT,
  ALLOWANCE_ENGAGEMENT_EVENT_TYPES,
  factType,
  allowanceFactMeta,
  readAllowanceEngagementEvent,
  deriveReaderActivity,
  asTrimmed,
};
