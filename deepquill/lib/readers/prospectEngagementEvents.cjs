/**
 * Read-only Event assembly for Stage C1 prospect engagement.
 *
 * Identity starts from the known ReaderProfile userId. VisitorIds used to
 * join pre-identification Events come only from server-recorded
 * READERS_AGREE_EMAIL_SUBMITTED rows for that User. A bare client-provided
 * Event.userId is never used to discover who the reader is.
 *
 * Performs findMany only. No writes, email, jobs, or schema changes.
 */

const { FUNNEL_EVENT_TYPES } = require('../funnel/funnelEventTypes.cjs');
const { isServerEmailSubmitted } = require('./classifyProspectEngagement.cjs');

const PROSPECT_ENGAGEMENT_EVENT_TYPES = Object.freeze([
  FUNNEL_EVENT_TYPES.READERS_AGREE_EMAIL_SUBMITTED,
  FUNNEL_EVENT_TYPES.READERS_AGREE_RETAILER_RETURN,
  FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK,
  FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK,
  FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
  FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
  FUNNEL_EVENT_TYPES.JODY_APPEAR,
  FUNNEL_EVENT_TYPES.JODY_CHAPTER_COMPLETED,
]);

const EVENT_SELECT = Object.freeze({
  id: true,
  userId: true,
  type: true,
  meta: true,
  createdAt: true,
});

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function metaOf(event) {
  const meta = event && event.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta;
}

function visitorIdOf(event) {
  const raw = metaOf(event).visitorId;
  const id = asTrimmed(typeof raw === 'string' ? raw : '');
  return id ? id.slice(0, 64) : '';
}

function isRelevantType(type) {
  return PROSPECT_ENGAGEMENT_EVENT_TYPES.includes(asTrimmed(type));
}

/**
 * VisitorIds that may join anonymous pre-identification Events.
 * Only server EMAIL_SUBMITTED for this userId counts.
 * @param {Array} events
 * @param {string} userId
 * @returns {Set<string>}
 */
function visitorIdsFromServerEmail(events, userId) {
  const ids = new Set();
  const expected = asTrimmed(userId);
  if (!expected) return ids;
  for (const event of Array.isArray(events) ? events : []) {
    if (!isServerEmailSubmitted(event)) continue;
    if (asTrimmed(event.userId) !== expected) continue;
    const visitorId = visitorIdOf(event);
    if (visitorId) ids.add(visitorId);
  }
  return ids;
}

/**
 * Keep Events that belong to this User or share a visitorId from that
 * User's server email capture. Events owned by a different userId are
 * never pulled in, even when the visitorId matches.
 * @param {Array} events
 * @param {{ userId: string, visitorIds?: Set<string> }} opts
 */
function selectProspectEngagementEvents(events, { userId, visitorIds } = {}) {
  const expected = asTrimmed(userId);
  const visitors = visitorIds instanceof Set ? visitorIds : visitorIdsFromServerEmail(events, expected);
  const selected = [];
  if (!expected) return selected;

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    if (!isRelevantType(event.type)) continue;
    const owner = asTrimmed(event.userId);
    if (owner === expected) {
      selected.push(event);
      continue;
    }
    if (owner) continue;
    const visitorId = visitorIdOf(event);
    if (visitorId && visitors.has(visitorId)) selected.push(event);
  }
  return selected;
}

/**
 * @param {Array} events
 * @param {string[]} userIds
 * @returns {Map<string, Array>}
 */
function groupProspectEngagementEvents(events, userIds) {
  const map = new Map();
  const ids = Array.isArray(userIds) ? userIds.map(asTrimmed).filter(Boolean) : [];
  for (const userId of ids) map.set(userId, []);
  if (!ids.length) return map;

  const visitorsByUser = new Map();
  for (const userId of ids) {
    visitorsByUser.set(userId, visitorIdsFromServerEmail(events, userId));
  }

  const usersByVisitor = new Map();
  for (const [userId, visitors] of visitorsByUser.entries()) {
    for (const visitorId of visitors) {
      if (!usersByVisitor.has(visitorId)) usersByVisitor.set(visitorId, []);
      usersByVisitor.get(visitorId).push(userId);
    }
  }

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    if (!isRelevantType(event.type)) continue;
    const owner = asTrimmed(event.userId);
    if (owner && map.has(owner)) {
      map.get(owner).push(event);
      continue;
    }
    if (owner) continue;
    const visitorId = visitorIdOf(event);
    const matchedUsers = visitorId ? usersByVisitor.get(visitorId) : null;
    if (!matchedUsers) continue;
    for (const userId of matchedUsers) map.get(userId).push(event);
  }
  return map;
}

/**
 * @param {object} prisma read-capable client (findMany only)
 * @param {string[]} userIds
 */
async function loadProspectEngagementEvents(prisma, userIds) {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map(asTrimmed).filter(Boolean))] : [];
  if (!ids.length) return new Map();
  if (!prisma || !prisma.event || typeof prisma.event.findMany !== 'function') {
    return groupProspectEngagementEvents([], ids);
  }

  const rows = await prisma.event.findMany({
    where: {
      type: { in: [...PROSPECT_ENGAGEMENT_EVENT_TYPES] },
      OR: [{ userId: { in: ids } }, { userId: null }],
    },
    select: EVENT_SELECT,
  });
  return groupProspectEngagementEvents(Array.isArray(rows) ? rows : [], ids);
}

module.exports = {
  PROSPECT_ENGAGEMENT_EVENT_TYPES,
  EVENT_SELECT,
  visitorIdOf,
  visitorIdsFromServerEmail,
  selectProspectEngagementEvents,
  groupProspectEngagementEvents,
  loadProspectEngagementEvents,
};
