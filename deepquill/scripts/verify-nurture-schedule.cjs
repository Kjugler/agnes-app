/**
 * Nurture schedule lock and count-only records. No database and no email.
 * Usage: node scripts/verify-nurture-schedule.cjs
 */
const assert = require('node:assert/strict');
const {
  sanitizeRunReason,
  publicRunRecord,
  beginPromotionalNurtureRun,
  finishPromotionalNurtureRun,
} = require('../lib/readers/recordPromotionalNurtureRun.cjs');

function memoryRuns() {
  const rows = [];
  let seq = 0;
  const api = {
    rows,
    promotionalNurtureRun: {
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of rows) {
          if (row.status !== where.status) continue;
          if (where.startedAt && where.startedAt.lte && !(row.startedAt <= where.startedAt.lte)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
      async findFirst({ where }) {
        return rows.find((row) => {
          if (where.status && row.status !== where.status) return false;
          if (where.startedAt && where.startedAt.gt && !(row.startedAt > where.startedAt.gt)) return false;
          return true;
        }) || null;
      },
      async create({ data }) {
        const row = { id: `run-${++seq}`, finishedAt: null, reason: null, ...data };
        rows.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error('missing run');
        Object.assign(row, data);
        return row;
      },
    },
    async $transaction(fn) {
      return fn(api);
    },
  };
  return api;
}

async function main() {
  const secretish = sanitizeRunReason('Bearer abc.def failed for reader@example.com https://x.test/a?token=1');
  assert.equal(secretish.includes('abc.def'), false);
  assert.equal(secretish.includes('reader@example.com'), false);
  assert.equal(secretish.includes('https://'), false);
  assert.equal(sanitizeRunReason('promotional_sending_disabled'), 'promotional_sending_disabled');

  const db = memoryRuns();
  const firstAt = new Date('2026-10-27T18:00:00.000Z');
  const first = await beginPromotionalNurtureRun(db, 'cron', firstAt);
  assert.equal(first.acquired, true);
  assert.equal(first.row.status, 'running');
  assert.equal(first.row.trigger, 'cron');

  const overlap = await beginPromotionalNurtureRun(db, 'cron', new Date(firstAt.getTime() + 1000));
  assert.equal(overlap.acquired, false);
  assert.equal(overlap.row.reason, 'overlap');
  assert.equal(overlap.row.sent, 0);
  assert.equal(db.rows.filter((row) => row.status === 'running').length, 1);

  const finished = await finishPromotionalNurtureRun(db, first.row.id, {
    status: 'completed',
    reason: 'promotional_sending_disabled',
    examined: 0,
    sent: 0,
    suppressed: 0,
    failedCount: 0,
    finishedAt: new Date('2026-10-27T18:00:01.000Z'),
  });
  const published = publicRunRecord(finished);
  assert.equal(published.sent, 0);
  assert.equal(published.examined, 0);
  assert.equal(published.suppressed, 0);
  assert.equal(published.reason, 'promotional_sending_disabled');
  assert.equal(published.trigger, 'cron');
  assert.equal(JSON.stringify(published).includes('@'), false);

  const later = await beginPromotionalNurtureRun(db, 'admin', new Date(firstAt.getTime() + 60 * 60 * 1000));
  assert.equal(later.acquired, true);
  assert.equal(later.row.trigger, 'admin');

  const staleDb = memoryRuns();
  staleDb.rows.push({
    id: 'old',
    startedAt: new Date('2026-10-27T17:00:00.000Z'),
    finishedAt: null,
    status: 'running',
    trigger: 'cron',
    reason: null,
    examined: 0,
    sent: 0,
    suppressed: 0,
    failedCount: 0,
  });
  const afterStale = await beginPromotionalNurtureRun(
    staleDb,
    'not-a-trigger',
    new Date('2026-10-27T17:30:00.000Z'),
  );
  assert.equal(afterStale.acquired, true);
  assert.equal(afterStale.row.trigger, 'admin');
  assert.equal(staleDb.rows.find((row) => row.id === 'old').status, 'failed');
  assert.equal(staleDb.rows.find((row) => row.id === 'old').reason, 'stale_lock');

  console.log('verify-nurture-schedule: passed');
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
