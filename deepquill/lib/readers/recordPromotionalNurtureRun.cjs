/**
 * Count-only history and overlap lock for the nurture runner.
 * Rows never store a reader, address, token, or credential.
 */

const STALE_MS = 20 * 60 * 1000;
const MAX_REASON = 160;

function normalizeTrigger(trigger) {
  return trigger === 'cron' ? 'cron' : 'admin';
}

function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function sanitizeRunReason(value) {
  if (value == null || value === '') return null;
  const text = String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/https?:\/\/\S+/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, MAX_REASON) : null;
}

function publicRunRecord(row) {
  const startedAt = row && row.startedAt instanceof Date ? row.startedAt.toISOString() : null;
  const finishedAt = row && row.finishedAt instanceof Date ? row.finishedAt.toISOString() : null;
  return {
    ok: Boolean(row) && row.status !== 'failed',
    sent: count(row && row.sent),
    examined: count(row && row.examined),
    suppressed: count(row && row.suppressed),
    failed: count(row && row.failedCount),
    reason: row && row.reason ? String(row.reason) : null,
    startedAt,
    finishedAt,
    status: row && row.status ? String(row.status) : null,
    trigger: row && row.trigger ? String(row.trigger) : null,
  };
}

async function beginPromotionalNurtureRun(prisma, trigger, now = new Date()) {
  const startedAt = now instanceof Date ? now : new Date(now);
  const staleBefore = new Date(startedAt.getTime() - STALE_MS);
  const safeTrigger = normalizeTrigger(trigger);
  return prisma.$transaction(async (tx) => {
    if (typeof tx.promotionalNurtureRun.updateMany === 'function') {
      await tx.promotionalNurtureRun.updateMany({
        where: { status: 'running', startedAt: { lte: staleBefore } },
        data: {
          status: 'failed',
          finishedAt: startedAt,
          reason: 'stale_lock',
          failedCount: 1,
        },
      });
    }
    const active = await tx.promotionalNurtureRun.findFirst({
      where: { status: 'running', startedAt: { gt: staleBefore } },
      select: { id: true },
    });
    if (active) {
      const row = await tx.promotionalNurtureRun.create({
        data: {
          startedAt,
          finishedAt: startedAt,
          status: 'overlapped',
          trigger: safeTrigger,
          reason: 'overlap',
          examined: 0,
          sent: 0,
          suppressed: 0,
          failedCount: 0,
        },
      });
      return { acquired: false, row };
    }
    const row = await tx.promotionalNurtureRun.create({
      data: {
        startedAt,
        status: 'running',
        trigger: safeTrigger,
        examined: 0,
        sent: 0,
        suppressed: 0,
        failedCount: 0,
      },
    });
    return { acquired: true, row };
  });
}

async function finishPromotionalNurtureRun(prisma, id, fields = {}) {
  return prisma.promotionalNurtureRun.update({
    where: { id },
    data: {
      finishedAt: fields.finishedAt instanceof Date ? fields.finishedAt : new Date(),
      status: fields.status === 'failed' ? 'failed' : 'completed',
      reason: sanitizeRunReason(fields.reason),
      examined: count(fields.examined),
      sent: count(fields.sent),
      suppressed: count(fields.suppressed),
      failedCount: count(fields.failedCount),
    },
  });
}

module.exports = {
  STALE_MS,
  normalizeTrigger,
  sanitizeRunReason,
  publicRunRecord,
  beginPromotionalNurtureRun,
  finishPromotionalNurtureRun,
};
