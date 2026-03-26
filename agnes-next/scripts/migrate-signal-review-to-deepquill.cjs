#!/usr/bin/env node
// agnes-next/scripts/migrate-signal-review-to-deepquill.cjs
// Migrate Signal, SignalReply, SignalAcknowledge, SignalComment, SignalCommentUpvote, SignalEvent, Review
// from agnes-next DB to deepquill DB. Preserves IDs.
//
// Uses RAW SQL for source reads to tolerate schema drift (e.g. older DB without author column).
// Target writes use Prisma with current deepquill schema.
//
// Usage (from agnes-next directory):
//   node scripts/migrate-signal-review-to-deepquill.cjs
//
// Or with explicit URLs:
//   AGNES_DATABASE_URL="file:./dev-next.db" DEEPQUILL_DATABASE_URL="file:../deepquill/dev.db" node scripts/migrate-signal-review-to-deepquill.cjs

const path = require('path');
const fs = require('fs');

const agnesRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '..', '..');

function readDbUrl(envPath) {
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  const m = content.match(/DATABASE_URL\s*=\s*(.+)/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

// Agnes source DB (from agnes-next .env)
let AGNES_URL =
  process.env.AGNES_DATABASE_URL ||
  readDbUrl(path.join(agnesRoot, '.env.local')) ||
  readDbUrl(path.join(agnesRoot, '.env')) ||
  'file:./dev-next.db';

// Deepquill target DB (from deepquill .env)
let DEEPQUILL_URL =
  process.env.DEEPQUILL_DATABASE_URL ||
  readDbUrl(path.join(repoRoot, 'deepquill', '.env.local')) ||
  readDbUrl(path.join(repoRoot, 'deepquill', '.env')) ||
  'file:../deepquill/dev.db';

// Resolve relative file: paths to absolute
if (AGNES_URL.startsWith('file:')) {
  const p = AGNES_URL.replace(/^file:/, '').trim();
  if (p.startsWith('.') || !path.isAbsolute(p)) {
    AGNES_URL = 'file:' + path.resolve(agnesRoot, p.replace(/^\.\//, ''));
  }
}
if (DEEPQUILL_URL.startsWith('file:')) {
  const p = DEEPQUILL_URL.replace(/^file:/, '').trim();
  if (p.startsWith('.') || !path.isAbsolute(p)) {
    DEEPQUILL_URL = 'file:' + path.resolve(agnesRoot, p.replace(/^\.\//, ''));
  }
}

console.log('[migrate] Source (agnes-next):', AGNES_URL.substring(0, 50) + '...');
console.log('[migrate] Target (deepquill):', DEEPQUILL_URL.substring(0, 50) + '...');

// Only need deepquill Prisma for target writes.
// Source reads use raw SQL via a minimal Prisma client to avoid schema-binding.
const { PrismaClient: DeepquillPrisma } = require(path.join(repoRoot, 'deepquill', 'node_modules', '.prisma', 'client'));
const prismaDeepquill = new DeepquillPrisma({ datasources: { db: { url: DEEPQUILL_URL } } });

// Raw SQL source client - use Prisma's raw query on a client connected to agnes DB.
// We use the deepquill client with AGNES_URL to run raw SQL - avoids agnes-next schema entirely.
const { PrismaClient } = require(path.join(repoRoot, 'deepquill', 'node_modules', '.prisma', 'client'));
const prismaSource = new PrismaClient({ datasources: { db: { url: AGNES_URL } } });

function rawSelect(client, sql) {
  return client.$queryRawUnsafe(sql);
}

async function inspectSourceSchema() {
  const tables = ['Signal', 'SignalReply', 'SignalAcknowledge', 'SignalComment', 'SignalCommentUpvote', 'SignalEvent', 'Review'];
  console.log('[migrate] Source DB schema (columns per table):');
  for (const table of tables) {
    try {
      const cols = await rawSelect(prismaSource, `PRAGMA table_info("${table}")`);
      const names = cols.map((c) => c.name);
      console.log('[migrate]   ', table + ':', names.join(', ') || '(table missing)');
    } catch (e) {
      console.log('[migrate]   ', table + ': (error)', e.message);
    }
  }
}

function val(row, key, def = null) {
  if (row == null) return def;
  const v = row[key];
  return v === undefined || v === null ? def : v;
}

async function migrate() {
  const stats = { signals: 0, replies: 0, acknowledges: 0, comments: 0, upvotes: 0, events: 0, reviews: 0, skipped: 0, errors: [] };

  try {
    await inspectSourceSchema();

    const targetUserIds = new Set((await prismaDeepquill.user.findMany({ select: { id: true } })).map((u) => u.id));
    console.log('[migrate] Target has', targetUserIds.size, 'users');

    // 1. Signals (RAW SQL - no schema binding)
    const signals = await rawSelect(prismaSource, 'SELECT * FROM Signal ORDER BY createdAt ASC');
    const existingSignalIds = new Set((await prismaDeepquill.signal.findMany({ select: { id: true } })).map((s) => s.id));
    console.log('[migrate] Signals: source=', signals.length, 'target existing=', existingSignalIds.size);

    for (const s of signals) {
      if (existingSignalIds.has(s.id)) { stats.skipped++; continue; }
      const userId = val(s, 'userId') && targetUserIds.has(val(s, 'userId')) ? val(s, 'userId') : null;
      if (val(s, 'userId') && !targetUserIds.has(val(s, 'userId'))) {
        console.warn('[migrate] Signal', s.id, 'userId', val(s, 'userId'), 'not in target – setting null');
      }
      try {
        await prismaDeepquill.signal.create({
          data: {
            id: s.id,
            createdAt: val(s, 'createdAt'),
            updatedAt: val(s, 'updatedAt', new Date()),
            userId,
            author: val(s, 'author'),           // missing in old schema → null
            isSystem: !!val(s, 'isSystem'),
            isAnonymous: !!val(s, 'isAnonymous'),
            text: val(s, 'text', ''),
            title: val(s, 'title'),
            type: val(s, 'type'),
            content: val(s, 'content'),
            mediaType: val(s, 'mediaType'),
            mediaUrl: val(s, 'mediaUrl'),
            locationTag: val(s, 'locationTag'),
            locationName: val(s, 'locationName'),
            locationLat: val(s, 'locationLat') != null ? Number(val(s, 'locationLat')) : null,
            locationLng: val(s, 'locationLng') != null ? Number(val(s, 'locationLng')) : null,
            tags: (() => {
              const t = val(s, 'tags');
              if (t == null) return null;
              if (typeof t === 'object') return t;
              try { return JSON.parse(t); } catch { return null; }
            })(),
            discussionEnabled: val(s, 'discussionEnabled') !== false && val(s, 'discussionEnabled') !== 0,
            publishAt: val(s, 'publishAt'),
            publishStatus: val(s, 'publishStatus') || 'PUBLISHED',
            status: val(s, 'status') || 'APPROVED',
            heldReason: val(s, 'heldReason'),
            heldAt: val(s, 'heldAt'),
            approvedAt: val(s, 'approvedAt'),
            rejectedAt: val(s, 'rejectedAt'),
            countryCode: val(s, 'countryCode'),
            region: val(s, 'region'),
          },
        });
        stats.signals++;
        if (stats.signals % 10 === 0) process.stdout.write('.');
      } catch (e) {
        stats.errors.push('Signal ' + s.id + ': ' + e.message);
      }
    }
    if (stats.signals > 0) console.log('');

    // 2. SignalReplies
    const replies = await rawSelect(prismaSource, 'SELECT * FROM SignalReply');
    const existingReplies = new Set((await prismaDeepquill.signalReply.findMany({ select: { id: true } })).map((r) => r.id));
    console.log('[migrate] SignalReplies: source=', replies.length, 'target existing=', existingReplies.size);

    for (const r of replies) {
      if (existingReplies.has(r.id)) { stats.skipped++; continue; }
      const userId = val(r, 'userId') && targetUserIds.has(val(r, 'userId')) ? val(r, 'userId') : null;
      try {
        await prismaDeepquill.signalReply.create({
          data: { id: r.id, createdAt: val(r, 'createdAt'), signalId: r.signalId, userId, isAnonymous: !!val(r, 'isAnonymous'), text: val(r, 'text', '') },
        });
        stats.replies++;
      } catch (e) {
        stats.errors.push('SignalReply ' + r.id + ': ' + e.message);
      }
    }

    // 3. SignalAcknowledges
    const acks = await rawSelect(prismaSource, 'SELECT * FROM SignalAcknowledge');
    const existingAcks = new Set((await prismaDeepquill.signalAcknowledge.findMany({ select: { id: true } })).map((a) => a.id));
    console.log('[migrate] SignalAcknowledges: source=', acks.length, 'target existing=', existingAcks.size);

    for (const a of acks) {
      if (existingAcks.has(a.id)) { stats.skipped++; continue; }
      if (!targetUserIds.has(val(a, 'userId'))) {
        console.warn('[migrate] SignalAcknowledge', a.id, 'userId', val(a, 'userId'), 'not in target – skipping');
        continue;
      }
      try {
        await prismaDeepquill.signalAcknowledge.create({
          data: { id: a.id, createdAt: val(a, 'createdAt'), signalId: a.signalId, userId: a.userId },
        });
        stats.acknowledges++;
      } catch (e) {
        stats.errors.push('SignalAcknowledge ' + a.id + ': ' + e.message);
      }
    }

    // 4. SignalComments (table may not exist in very old schema)
    let comments = [];
    try {
      comments = await rawSelect(prismaSource, 'SELECT * FROM SignalComment');
    } catch (e) {
      console.warn('[migrate] SignalComment table missing or error:', e.message);
    }
    const existingComments = new Set((await prismaDeepquill.signalComment.findMany({ select: { id: true } })).map((c) => c.id));
    console.log('[migrate] SignalComments: source=', comments.length, 'target existing=', existingComments.size);

    for (const c of comments) {
      if (existingComments.has(c.id)) { stats.skipped++; continue; }
      const userId = val(c, 'userId') && targetUserIds.has(val(c, 'userId')) ? val(c, 'userId') : null;
      try {
        await prismaDeepquill.signalComment.create({
          data: {
            id: c.id,
            createdAt: val(c, 'createdAt'),
            signalId: c.signalId,
            userId,
            commentText: val(c, 'commentText', ''),
            upvotes: val(c, 'upvotes') != null ? Number(val(c, 'upvotes')) : 0,
            isFlagged: !!val(c, 'isFlagged'),
            flagReason: val(c, 'flagReason'),
          },
        });
        stats.comments++;
      } catch (e) {
        stats.errors.push('SignalComment ' + c.id + ': ' + e.message);
      }
    }

    // 5. SignalCommentUpvotes
    let upvotes = [];
    try {
      upvotes = await rawSelect(prismaSource, 'SELECT * FROM SignalCommentUpvote');
    } catch (e) {
      console.warn('[migrate] SignalCommentUpvote table missing or error:', e.message);
    }
    const existingUpvotes = new Set(
      (await prismaDeepquill.signalCommentUpvote.findMany()).map((u) => u.commentId + ':' + u.userId)
    );
    console.log('[migrate] SignalCommentUpvotes: source=', upvotes.length, 'target existing=', existingUpvotes.size);

    for (const u of upvotes) {
      const key = u.commentId + ':' + u.userId;
      if (existingUpvotes.has(key)) { stats.skipped++; continue; }
      if (!targetUserIds.has(val(u, 'userId'))) {
        console.warn('[migrate] SignalCommentUpvote', u.commentId + ':' + u.userId, 'user not in target – skipping');
        continue;
      }
      try {
        await prismaDeepquill.signalCommentUpvote.create({
          data: { id: u.id, createdAt: val(u, 'createdAt'), commentId: u.commentId, userId: u.userId },
        });
        stats.upvotes++;
      } catch (e) {
        stats.errors.push('SignalCommentUpvote ' + u.id + ': ' + e.message);
      }
    }

    // 6. SignalEvents
    let events = [];
    try {
      events = await rawSelect(prismaSource, 'SELECT * FROM SignalEvent');
    } catch (e) {
      console.warn('[migrate] SignalEvent table missing or error:', e.message);
    }
    const existingEvents = new Set((await prismaDeepquill.signalEvent.findMany({ select: { id: true } })).map((e) => e.id));
    console.log('[migrate] SignalEvents: source=', events.length, 'target existing=', existingEvents.size);

    for (const e of events) {
      if (existingEvents.has(e.id)) { stats.skipped++; continue; }
      try {
        await prismaDeepquill.signalEvent.create({
          data: { id: e.id, createdAt: val(e, 'createdAt'), signalId: e.signalId, eventText: val(e, 'eventText', '') },
        });
        stats.events++;
      } catch (err) {
        stats.errors.push('SignalEvent ' + e.id + ': ' + err.message);
      }
    }

    // 7. Reviews
    let reviews = [];
    try {
      reviews = await rawSelect(prismaSource, 'SELECT * FROM Review');
    } catch (e) {
      console.warn('[migrate] Review table missing or error:', e.message);
    }
    const existingReviews = new Set((await prismaDeepquill.review.findMany({ select: { id: true } })).map((r) => r.id));
    console.log('[migrate] Reviews: source=', reviews.length, 'target existing=', existingReviews.size);

    for (const r of reviews) {
      if (existingReviews.has(r.id)) { stats.skipped++; continue; }
      if (!targetUserIds.has(val(r, 'userId'))) {
        console.warn('[migrate] Review', r.id, 'userId', val(r, 'userId'), 'not in target – skipping');
        continue;
      }
      try {
        await prismaDeepquill.review.create({
          data: {
            id: r.id,
            createdAt: val(r, 'createdAt'),
            updatedAt: val(r, 'updatedAt', new Date()),
            userId: r.userId,
            rating: Number(val(r, 'rating', 5)),
            text: val(r, 'text', ''),
            tags: val(r, 'tags'),
            status: val(r, 'status') || 'APPROVED',
            heldReason: val(r, 'heldReason'),
            heldAt: val(r, 'heldAt'),
            approvedAt: val(r, 'approvedAt'),
            rejectedAt: val(r, 'rejectedAt'),
            countryCode: val(r, 'countryCode'),
            region: val(r, 'region'),
          },
        });
        stats.reviews++;
      } catch (e) {
        stats.errors.push('Review ' + r.id + ': ' + e.message);
      }
    }

    console.log('');
    console.log('[migrate] Done:', JSON.stringify(stats, null, 2));
    if (stats.errors.length) console.error('[migrate] Errors:', stats.errors);
    return stats;
  } finally {
    await prismaSource.$disconnect();
    await prismaDeepquill.$disconnect();
  }
}

migrate().catch((err) => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});
