/**
 * Read-only Event assembly for Stage C1 prospect engagement.
 *
 * Identity is never taken from Event rows. VisitorIds used to join
 * anonymous pre-identification Events come only from
 * ReaderProfile.leadAttribution.visitorId written by Stage A
 * POST /api/readers-agree/lead. A bare client Event.userId, ap_funnel_uid,
 * or Event.meta.source === 'server' cannot discover who the reader is.
 *
 * Assembled Events are behavioral analytics for a profile that already
 * has that leadAttribution anchor. Performs findMany only. No writes,
 * email, jobs, or schema changes.
 */

const { FUNNEL_EVENT_TYPES } = require('../funnel/funnelEventTypes.cjs');
const { isReadersAgreeLeadAttribution, leadAttributionVisitorId } = require('./classifyProspectEngagement.cjs');

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

function visitorIdsFromLeadAttribution(leadAttribution) {
  const ids = new Set();
  const visitorId = leadAttributionVisitorId(leadAttribution);
  if (visitorId) ids.add(visitorId);
  return ids;
}

function visitorIdsByUserFromProfiles(profiles) {
  const map = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const userId = asTrimmed(profile && profile.userId);
    if (!userId) continue;
    if (!isReadersAgreeLeadAttribution(profile.leadAttribution)) continue;
    const visitors = visitorIdsFromLeadAttribution(profile.leadAttribution);
    if (visitors.size) map.set(userId, visitors);
  }
  return map;
}

/**
 * Keep Events that belong to this User or share a visitorId from that
 * User's Stage A leadAttribution. Events owned by a different userId are
 * never pulled in, even when the visitorId matches.
 *
 * Anonymous joins require an explicit visitorIds set from leadAttribution.
 * Event.meta.source === 'server' is never used to discover visitorIds.
 *
 * @param {Array} events
 * @param {{ userId: string, visitorIds?: Set<string> }} opts
 */
function selectProspectEngagementEvents(events, { userId, visitorIds } = {}) {
  const expected = asTrimmed(userId);
  const visitors = visitorIds instanceof Set ? visitorIds : new Set();
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
 * @param {Map<string, Set<string>>} [visitorIdsByUser]
 * @returns {Map<string, Array>}
 */
function groupProspectEngagementEvents(events, userIds, visitorIdsByUser) {
  const map = new Map();
  const ids = Array.isArray(userIds) ? userIds.map(asTrimmed).filter(Boolean) : [];
  for (const userId of ids) map.set(userId, []);
  if (!ids.length) return map;

  const visitorsByUser = visitorIdsByUser instanceof Map ? visitorIdsByUser : new Map();
  const usersByVisitor = new Map();
  for (const userId of ids) {
    const visitors = visitorsByUser.get(userId);
    if (!(visitors instanceof Set)) continue;
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
 * @param {Map<string, Set<string>>} [visitorIdsByUser]
 */
async function loadProspectEngagementEvents(prisma, userIds, visitorIdsByUser) {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map(asTrimmed).filter(Boolean))] : [];
  if (!ids.length) return new Map();
  if (!prisma || !prisma.event || typeof prisma.event.findMany !== 'function') {
    return groupProspectEngagementEvents([], ids, visitorIdsByUser);
  }

  const rows = await prisma.event.findMany({
    where: {
      type: { in: [...PROSPECT_ENGAGEMENT_EVENT_TYPES] },
      OR: [{ userId: { in: ids } }, { userId: null }],
    },
    select: EVENT_SELECT,
  });
  return groupProspectEngagementEvents(Array.isArray(rows) ? rows : [], ids, visitorIdsByUser);
}

module.exports = {
  PROSPECT_ENGAGEMENT_EVENT_TYPES,
  EVENT_SELECT,
  visitorIdOf,
  visitorIdsFromLeadAttribution,
  visitorIdsByUserFromProfiles,
  selectProspectEngagementEvents,
  groupProspectEngagementEvents,
  loadProspectEngagementEvents,
};
