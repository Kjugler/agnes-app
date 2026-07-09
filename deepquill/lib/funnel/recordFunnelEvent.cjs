// Record first-party funnel events in Event table (canonical deepquill DB).

const { isFunnelEventType, isSampleChapterId } = require('./funnelEventTypes.cjs');

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.length > 2000) {
      out[key] = value.slice(0, 2000);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function validatePayload({ type, meta }) {
  if (!isFunnelEventType(type)) {
    return { ok: false, error: 'invalid_event_type' };
  }
  if (type === 'SAMPLE_CHAPTER_OPEN' || type === 'SAMPLE_CHAPTER_TIME_ON_PAGE') {
    const chapterId = meta?.chapterId != null ? String(meta.chapterId) : '';
    if (!isSampleChapterId(chapterId)) {
      return { ok: false, error: 'invalid_chapter_id' };
    }
  }
  if (type === 'SAMPLE_CHAPTER_TIME_ON_PAGE') {
    const seconds = Number(meta?.secondsOnPage);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) {
      return { ok: false, error: 'invalid_time_on_page' };
    }
  }
  if (type === 'READERS_AGREE_SCROLL_DEPTH') {
    const depth = Number(meta?.depthPercent);
    if (![25, 50, 75, 100].includes(depth)) {
      return { ok: false, error: 'invalid_scroll_depth' };
    }
  }
  if (type === 'READERS_AGREE_TIME_ON_PAGE') {
    const seconds = Number(meta?.secondsOnPage);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) {
      return { ok: false, error: 'invalid_time_on_page' };
    }
  }
  return { ok: true };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function recordFunnelEvent(prisma, payload) {
  const { type, visitorId, userId, ref, path, source, meta } = payload;
  const check = validatePayload({ type, meta: meta || {} });
  if (!check.ok) return check;

  const cleanMeta = sanitizeMeta(meta);
  const event = await prisma.event.create({
    data: {
      type,
      userId: userId || null,
      meta: {
        visitorId: visitorId || null,
        ref: ref || null,
        path: path || null,
        source: source || null,
        ...cleanMeta,
      },
    },
  });

  return { ok: true, id: event.id };
}

module.exports = {
  recordFunnelEvent,
  validatePayload,
  sanitizeMeta,
};
