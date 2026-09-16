/**
 * Pure prospect-engagement classifier (Stage C1).
 *
 * Side-effect free: no Prisma, filesystem, env, logging, or email.
 * Does not mutate its input. Same input → same output.
 *
 * Identity is NOT derived from Event rows. The only authoritative
 * Readers Agree identity anchor is ReaderProfile.leadAttribution written
 * by syncReadersAgreeLeadProfile from POST /api/readers-agree/lead
 * (capturedAt + captureSurface). Event.meta.source === 'server' is not
 * identity: POST /api/funnel/event lets the client set that metadata.
 *
 * Once that leadAttribution anchor exists, assembled Events and the
 * server remembered-place fact are behavioral analytics only — not send
 * authorization. Stage D must independently require this identity plus
 * ownership/contactability; it must never send solely because an
 * Event-derived engagement state exists.
 *
 * Ownership, contactability, archive/DNC, review, and promotional
 * eligibility remain a separate axis (`classifyReader` / outreach helpers).
 * This module never writes ReaderProfile, ReaderEvidence, leadAttribution,
 * or prospectNurture* columns.
 *
 * @typedef {object} ProspectEngagementEvent
 * @property {string|null} [type]
 * @property {string|null} [userId]
 * @property {object|null} [meta]
 * @property {string|Date|null} [createdAt]
 *
 * @typedef {object} ClassifyProspectEngagementInput
 * @property {object|null} [leadAttribution]
 * @property {ProspectEngagementEvent[]} [events]
 * @property {string|null} [lastCompletedChapterId]
 * @property {string|Date|null} [lastCompletedAt]
 */

const { FUNNEL_EVENT_TYPES, isSampleChapterId } = require('../funnel/funnelEventTypes.cjs');

const ENGAGEMENT = Object.freeze({
  IDENTIFIED: 'identified',
  SAMPLE_ENGAGED: 'sample_engaged',
  RETAILER_RETURN_ENGAGED: 'retailer_return_engaged',
});

const RETAILER_ORIGIN = Object.freeze({
  AMAZON: 'amazon',
  BN: 'bn',
});

const REASON = Object.freeze({
  EMAIL_CAPTURED: 'email_captured',
  CHAPTER_OPENED: 'chapter_opened',
  DWELL_90S: 'dwell_90s',
  DWELL_90S_SUM: 'dwell_90s_sum',
  JODY_90S: 'jody_90s',
  REMEMBERED_PLACE: 'remembered_place',
  RETAILER_RETURN: 'retailer_return',
});

const MEANINGFUL_DWELL_SECONDS = 90;
const CHAPTER_ORDER = Object.freeze(['1', '2', '9', '45']);
const JODY_REMEMBER_OFFER = 'remember-offer';
const IDENTITY_ANCHOR = 'readers_agree_lead_attribution';

/**
 * Inclusive Instant after which READERS_AGREE_RETAILER_RETURN may establish
 * a true retailer return. Named constant — do not scatter this timestamp.
 *
 * This is the earliest production RETURN personally verified to have B2
 * true-resume semantics (visitor 434098fd-1428-43c4-94f1-d98e46d51fb5).
 * It is intentionally conservative and is not the Vercel
 * deployment-created timestamp (dpl_A1yq7o3HUUy9JMgKuAQhn8Ke7hmW at
 * 2026-09-16T16:16:03.641Z). Earlier 16:18–16:20 RETURN rows still
 * exhibited pre-B2 behavior because already-loaded clients could retain
 * old JavaScript. Pre-cutoff RETURN Events therefore cannot establish
 * retailerReturn.
 */
const B2_TRUE_RESUME_VERIFIED_AT_ISO = '2026-09-16T16:31:02.891Z';
const B2_TRUE_RESUME_VERIFIED_AT = new Date(B2_TRUE_RESUME_VERIFIED_AT_ISO);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function metaOf(event) {
  const meta = event && event.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta;
}

function addReason(reasons, code) {
  if (code && !reasons.includes(code)) reasons.push(code);
}

function normalizeRetailerOrigin(raw) {
  const s = asTrimmedString(raw).toLowerCase();
  if (s === RETAILER_ORIGIN.AMAZON) return RETAILER_ORIGIN.AMAZON;
  if (s === RETAILER_ORIGIN.BN || s === 'b&n' || s === 'barnes_noble' || s === 'barnes noble') {
    return RETAILER_ORIGIN.BN;
  }
  return null;
}

function eventTime(event) {
  if (!event || event.createdAt == null) return null;
  const d = event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoFrom(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function chapterIdOf(event) {
  const id = metaOf(event).chapterId;
  if (id == null || id === '') return '';
  const chapterId = String(id);
  return isSampleChapterId(chapterId) ? chapterId : '';
}

function secondsOnPage(event) {
  const seconds = Number(metaOf(event).secondsOnPage);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds;
}

/**
 * Stage A lead snapshot written only by syncReadersAgreeLeadProfile.
 * Phase D historical rows have enrolledAt without capturedAt and must not
 * count. Public /api/funnel/event cannot write ReaderProfile.
 */
function isReadersAgreeLeadAttribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const capturedAt = asTrimmedString(value.capturedAt);
  if (!capturedAt) return false;
  if (Number.isNaN(new Date(capturedAt).getTime())) return false;
  const surface = asTrimmedString(value.captureSurface);
  return surface === 'landing' || surface === 'bridge';
}

function leadAttributionVisitorId(value) {
  if (!isReadersAgreeLeadAttribution(value)) return '';
  const id = asTrimmedString(value.visitorId);
  return id ? id.slice(0, 64) : '';
}

function isQualifyingJody(event) {
  if (!event) return false;
  if (event.type === FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED) return true;
  if (event.type !== FUNNEL_EVENT_TYPES.JODY_APPEAR) return false;
  const meta = metaOf(event);
  return meta.mode === JODY_REMEMBER_OFFER || meta.beatId === JODY_REMEMBER_OFFER;
}

function isTrustworthyRetailerReturn(event) {
  if (!event || event.type !== FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN) return false;
  const at = eventTime(event);
  if (!at) return false;
  return at.getTime() >= B2_TRUE_RESUME_VERIFIED_AT.getTime();
}

function originFromEvent(event) {
  if (!event) return null;
  const fromMeta = normalizeRetailerOrigin(metaOf(event).retailerOrigin);
  if (fromMeta) return fromMeta;
  if (event.type === FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK) return RETAILER_ORIGIN.AMAZON;
  if (event.type === FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK) return RETAILER_ORIGIN.BN;
  return null;
}

function laterEvent(left, right) {
  const leftTime = eventTime(left);
  const rightTime = eventTime(right);
  if (!rightTime) return left;
  if (!leftTime) return right;
  return rightTime >= leftTime ? right : left;
}

function orderedChapters(set) {
  return CHAPTER_ORDER.filter((id) => set.has(id));
}

function latestIso(dates) {
  let latest = null;
  for (const value of dates) {
    const iso = isoFrom(value);
    if (!iso) continue;
    if (!latest || iso > latest) latest = iso;
  }
  return latest;
}

function emptyProspectEngagement() {
  return {
    engagement: null,
    retailerReturn: false,
    retailerOrigin: null,
    sampleEngaged: false,
    chaptersSampled: [],
    latestEngagementAt: null,
    reasons: [],
    analyticsOnly: true,
    identityAnchor: null,
  };
}

/**
 * @param {ClassifyProspectEngagementInput|null|undefined} input
 */
function classifyProspectEngagement(input) {
  const src = input && typeof input === 'object' ? input : {};
  if (!isReadersAgreeLeadAttribution(src.leadAttribution)) {
    return emptyProspectEngagement();
  }

  const events = asArray(src.events);
  const reasons = [];
  const chapters = new Set();
  const dwellByChapter = new Map();
  const latestCandidates = [];

  let hasChapterOpen = false;
  let hasSingleDwell90 = false;
  let hasReturn = false;
  let hasQualifyingJody = false;
  let latestEmail = null;
  let latestReturn = null;
  let latestClick = null;

  addReason(reasons, REASON.EMAIL_CAPTURED);

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const type = asTrimmedString(event.type);
    const chapterId = chapterIdOf(event);
    const at = eventTime(event);

    if (type === FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED) {
      latestEmail = laterEvent(latestEmail, event);
      if (at) latestCandidates.push(at);
    }

    if (isTrustworthyRetailerReturn(event)) {
      hasReturn = true;
      latestReturn = laterEvent(latestReturn, event);
      if (at) latestCandidates.push(at);
    }

    if (
      type === FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK ||
      type === FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK
    ) {
      latestClick = laterEvent(latestClick, event);
    }

    if (type === FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN && chapterId) {
      hasChapterOpen = true;
      chapters.add(chapterId);
      if (at) latestCandidates.push(at);
    }

    if (type === FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE && chapterId) {
      chapters.add(chapterId);
      const seconds = secondsOnPage(event);
      dwellByChapter.set(chapterId, (dwellByChapter.get(chapterId) || 0) + seconds);
      if (seconds >= MEANINGFUL_DWELL_SECONDS) hasSingleDwell90 = true;
      if (at) latestCandidates.push(at);
    }

    if (isQualifyingJody(event)) {
      hasQualifyingJody = true;
      if (chapterId) chapters.add(chapterId);
      if (at) latestCandidates.push(at);
    }
  }

  const rememberedChapter = asTrimmedString(src.lastCompletedChapterId);
  const rememberedPlace = Boolean(rememberedChapter && isSampleChapterId(rememberedChapter));
  if (rememberedPlace) {
    chapters.add(rememberedChapter);
    if (src.lastCompletedAt) latestCandidates.push(src.lastCompletedAt);
  }

  let hasDwellSum90 = false;
  for (const total of dwellByChapter.values()) {
    if (total >= MEANINGFUL_DWELL_SECONDS) {
      hasDwellSum90 = true;
      break;
    }
  }

  if (hasChapterOpen) addReason(reasons, REASON.CHAPTER_OPENED);
  if (hasSingleDwell90) addReason(reasons, REASON.DWELL_90S);
  else if (hasDwellSum90) addReason(reasons, REASON.DWELL_90S_SUM);
  if (hasQualifyingJody) addReason(reasons, REASON.JODY_90S);
  if (rememberedPlace) addReason(reasons, REASON.REMEMBERED_PLACE);
  if (hasReturn) addReason(reasons, REASON.RETAILER_RETURN);

  const sampleEngaged = hasSingleDwell90 || hasDwellSum90 || hasQualifyingJody || rememberedPlace;
  const retailerOrigin =
    originFromEvent(latestEmail) || originFromEvent(latestReturn) || originFromEvent(latestClick);

  let engagement = ENGAGEMENT.IDENTIFIED;
  if (hasReturn && sampleEngaged) engagement = ENGAGEMENT.RETAILER_RETURN_ENGAGED;
  else if (sampleEngaged) engagement = ENGAGEMENT.SAMPLE_ENGAGED;

  return {
    engagement,
    retailerReturn: hasReturn,
    retailerOrigin,
    sampleEngaged,
    chaptersSampled: orderedChapters(chapters),
    latestEngagementAt: latestIso(latestCandidates),
    reasons,
    analyticsOnly: true,
    identityAnchor: IDENTITY_ANCHOR,
  };
}

module.exports = {
  classifyProspectEngagement,
  emptyProspectEngagement,
  isReadersAgreeLeadAttribution,
  leadAttributionVisitorId,
  isTrustworthyRetailerReturn,
  ENGAGEMENT,
  RETAILER_ORIGIN,
  REASON,
  MEANINGFUL_DWELL_SECONDS,
  B2_TRUE_RESUME_VERIFIED_AT,
  B2_TRUE_RESUME_VERIFIED_AT_ISO,
  IDENTITY_ANCHOR,
  isQualifyingJody,
};
