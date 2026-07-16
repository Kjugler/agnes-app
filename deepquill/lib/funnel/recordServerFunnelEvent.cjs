// Record funnel events from deepquill server handlers (email verify, etc.).

const { recordFunnelEvent } = require('./recordFunnelEvent.cjs');

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ type: string, userId?: string, meta?: Record<string, unknown> }} payload
 */
async function recordServerFunnelEvent(prisma, { type, userId, meta = {} }) {
  try {
    return await recordFunnelEvent(prisma, {
      type,
      userId: userId || null,
      visitorId: null,
      ref: null,
      path: null,
      source: 'server',
      meta,
    });
  } catch (err) {
    console.warn('[recordServerFunnelEvent]', type, err?.message);
    return { ok: false };
  }
}

module.exports = { recordServerFunnelEvent };
