// deepquill/server/routes/signals.cjs
// Signal CRUD - canonical DB owner

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { resolveUserByEmail, getEmailFromRequest } = require('../../lib/resolveUser.cjs');
const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
const { createSignalEvent } = require('../../lib/signalEvent.cjs');

const router = express.Router();

const PROFANITY_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'faggot'];
const SPAM_KEYWORDS = ['buy now', 'click here', 'free money', 'winner', 'congratulations', 'act now'];
const VALID_TYPES = ['ARCHIVE', 'LOCATION', 'VISUAL', 'NARRATIVE', 'PLAYER_QUESTION', 'PODCASTER_PROMPT', 'SPECULATIVE'];
const VALID_MEDIA_TYPES = ['image', 'video', 'map', 'document', 'audio'];

function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** First-party Signal video uploads (Vercel Blob); held for moderation during beta. */
function isFirstPartyUploadedMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    const onVercelBlob =
      h.endsWith('.public.blob.vercel-storage.com') || h.endsWith('.blob.vercel-storage.com');
    if (!onVercelBlob) return false;
    return u.pathname.includes('/signals/');
  } catch {
    return false;
  }
}

function containsLink(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return lower.includes('http://') || lower.includes('https://') || lower.includes('www.') || lower.includes('.com') || lower.includes('@');
}

function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return PROFANITY_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower));
}

function containsSpam(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some((kw) => lower.includes(kw));
}

function isAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

// GET /api/signal/events - Must be before /signal/:id to avoid "events" being captured as id
router.get('/signal/events', async (req, res) => {
  try {
    const events = await prisma.signalEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, signalId: true, eventText: true, createdAt: true },
    });
    const { ribbonLineFromSummary } = require('../../lib/dailyContestSummary.cjs');
    const latestSummary = await prisma.dailyContestSummary.findFirst({
      orderBy: { summaryDate: 'desc' },
    });
    const ribbonExtra = ribbonLineFromSummary(latestSummary);
    const merged = [...events];
    if (ribbonExtra) {
      merged.unshift({
        id: `daily-contest-${latestSummary.summaryDate}`,
        signalId: 'daily-contest',
        eventText: ribbonExtra,
        createdAt: latestSummary.updatedAt || latestSummary.generatedAt,
      });
    }
    res.json({ ok: true, events: merged });
  } catch (err) {
    console.error('[signal/events] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/signal/upload-auth — used by agnes-next Vercel Blob client upload (cookie auth)
router.get('/signal/upload-auth', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }
    return res.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error('[signal/upload-auth] Error', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/signal/:id - Single approved signal (public, for detail page)
router.get('/signal/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const currentUser = await resolveUserByEmail(req);

    const signal = await prisma.signal.findFirst({
      where: {
        id,
        status: 'APPROVED',
        OR: [{ publishStatus: 'PUBLISHED' }, { publishStatus: null }],
      },
      include: {
        user: { select: { email: true, firstName: true } },
        replies: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { email: true, firstName: true } } },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          where: { isFlagged: false },
          include: {
            user: { select: { email: true, firstName: true } },
            upvoteRecords: { select: { id: true, userId: true } },
          },
        },
        acknowledges: currentUser
          ? { where: { userId: currentUser.id }, select: { id: true } }
          : { select: { id: true }, take: 0 },
        _count: { select: { replies: true, acknowledges: true, comments: true } },
      },
    });
    if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found' });

    res.json({
      ok: true,
      signal: {
        id: signal.id,
        text: signal.text,
        title: signal.title ?? null,
        type: signal.type ?? null,
        content: signal.content ?? null,
        mediaType: signal.mediaType ?? null,
        mediaUrl: signal.mediaUrl ?? null,
        locationTag: signal.locationTag ?? null,
        locationName: signal.locationName ?? null,
        locationLat: signal.locationLat ?? null,
        locationLng: signal.locationLng ?? null,
        tags: signal.tags ?? null,
        discussionEnabled: signal.discussionEnabled ?? true,
        isSystem: signal.isSystem,
        createdAt: signal.createdAt,
        userEmail: signal.user?.email ?? null,
        userFirstName: signal.user?.firstName ?? null,
        isAuthor: !!(currentUser && signal.userId && signal.userId === currentUser.id),
        replyCount: signal._count.replies,
        acknowledgeCount: signal._count.acknowledges,
        commentCount: signal._count.comments,
        acknowledged: signal.acknowledges.length > 0,
        replies: signal.replies.map((r) => ({
          id: r.id,
          text: r.text,
          createdAt: r.createdAt,
          userEmail: r.user?.email ?? null,
          userFirstName: r.user?.firstName ?? null,
        })),
        comments: signal.comments.map((c) => ({
          id: c.id,
          commentText: c.commentText,
          upvotes: c.upvotes,
          createdAt: c.createdAt,
          userEmail: c.user?.email ?? null,
          userFirstName: c.user?.firstName ?? null,
          hasUpvoted: currentUser && (c.upvoteRecords || []).some((r) => r.userId === currentUser.id),
        })),
      },
    });
  } catch (err) {
    console.error('[signals] GET /signal/:id error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

// GET /api/signals/me — current user's recent signals (any moderation status); for “pending” strip + support IDs
router.get('/signals/me', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    const limit = Math.min(parseInt(req.query.limit || '15', 10), 30);
    const rows = await prisma.signal.findMany({
      where: { userId: user.id, isSystem: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        text: true,
        title: true,
        type: true,
        content: true,
        mediaType: true,
        mediaUrl: true,
        locationTag: true,
        tags: true,
        discussionEnabled: true,
        isSystem: true,
        status: true,
        heldReason: true,
        heldAt: true,
        approvedAt: true,
        rejectedAt: true,
        createdAt: true,
        user: { select: { email: true, firstName: true } },
      },
    });

    const signals = rows.map((s) => ({
      id: s.id,
      text: s.text,
      title: s.title ?? null,
      type: s.type ?? null,
      content: s.content ?? null,
      mediaType: s.mediaType ?? null,
      mediaUrl: s.mediaUrl ?? null,
      locationTag: s.locationTag ?? null,
      tags: s.tags ?? null,
      discussionEnabled: s.discussionEnabled ?? true,
      isSystem: s.isSystem,
      createdAt: s.createdAt,
      userEmail: s.user?.email ?? null,
      userFirstName: s.user?.firstName ?? null,
      isAuthor: true,
      moderationStatus: s.status,
      heldReason: s.heldReason ?? null,
      heldAt: s.heldAt ?? null,
      approvedAt: s.approvedAt ?? null,
      rejectedAt: s.rejectedAt ?? null,
      replyCount: 0,
      acknowledgeCount: 0,
      acknowledged: false,
      replies: [],
    }));

    res.json({ ok: true, signals });
  } catch (err) {
    console.error('[signals/me] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// GET /api/signals - List published signals (ordered by visible time: COALESCE(approvedAt, createdAt) desc)
router.get('/signals', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const type = req.query.type;
    const currentUser = await resolveUserByEmail(req);

    const typeFilter = type && type !== 'all' && VALID_TYPES.includes(type) ? type : null;

    let sql = `
      SELECT id FROM Signal
      WHERE status = 'APPROVED'
        AND ("publishStatus" = 'PUBLISHED' OR "publishStatus" IS NULL)`;
    const sqlParams = [];
    if (typeFilter) {
      sql += ` AND "type" = ?`;
      sqlParams.push(typeFilter);
    }
    sql += `
      ORDER BY datetime(COALESCE("approvedAt", "createdAt")) DESC, id DESC
      LIMIT ? OFFSET ?`;
    sqlParams.push(limit + 1, offset);

    const idRows = await prisma.$queryRawUnsafe(sql, ...sqlParams);
    const ids = Array.isArray(idRows) ? idRows.map((r) => r.id) : [];

    if (ids.length === 0) {
      return res.json({
        ok: true,
        signals: [],
        nextCursor: null,
        nextOffset: null,
        hasMore: false,
      });
    }

    const signalsUnordered = await prisma.signal.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        userId: true,
        text: true,
        title: true,
        type: true,
        content: true,
        mediaType: true,
        mediaUrl: true,
        locationTag: true,
        tags: true,
        discussionEnabled: true,
        isSystem: true,
        createdAt: true,
        author: true,
        approvedAt: true,
        user: { select: { email: true, firstName: true } },
        _count: { select: { replies: true, acknowledges: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { email: true, firstName: true } } },
        },
      },
    });
    const byId = new Map(signalsUnordered.map((s) => [s.id, s]));
    const signals = ids.map((id) => byId.get(id)).filter(Boolean);

    const hasMore = signals.length > limit;
    const items = hasMore ? signals.slice(0, limit) : signals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;
    const nextOffset = hasMore ? offset + limit : null;

    const signalsData = items.map((s) => ({
      id: s.id,
      text: s.text,
      title: s.title ?? null,
      type: s.type ?? null,
      content: s.content ?? null,
      mediaType: s.mediaType ?? null,
      mediaUrl: s.mediaUrl ?? null,
      locationTag: s.locationTag ?? null,
      tags: s.tags ?? null,
      discussionEnabled: s.discussionEnabled ?? true,
      isSystem: s.isSystem,
      createdAt: s.createdAt,
      approvedAt: s.approvedAt ?? null,
      moderationStatus: 'APPROVED',
      userEmail: s.user?.email ?? null,
      userFirstName: s.user?.firstName ?? null,
      isAuthor: !!(currentUser && s.userId && s.userId === currentUser.id),
      replyCount: s._count.replies,
      acknowledgeCount: s._count.acknowledges,
      acknowledged: false,
      replies: s.replies.map((r) => ({
        id: r.id,
        text: r.text,
        createdAt: r.createdAt,
        userEmail: r.user?.email ?? null,
        userFirstName: r.user?.firstName ?? null,
      })),
    }));

    res.json({ ok: true, signals: signalsData, nextCursor, nextOffset, hasMore });
  } catch (err) {
    console.error('[signals] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// PATCH /api/signal/:id - Author self-service update
router.patch('/signal/:id', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const id = req.params.id;
    const existing = await prisma.signal.findUnique({
      where: { id },
      select: { userId: true, status: true, publishStatus: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Signal not found' });
    if (existing.userId !== user.id) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    if (existing.status !== 'APPROVED') return res.status(400).json({ ok: false, error: 'Signal not approved' });

    const body = req.body || {};
    const updates = {};

    if (typeof body.text === 'string' && body.text.trim().length >= 3) updates.text = body.text.trim();
    if (typeof body.title === 'string') updates.title = body.title.trim() || null;
    if (typeof body.type === 'string' && VALID_TYPES.includes(body.type)) updates.type = body.type;
    if (typeof body.content === 'string') updates.content = body.content.trim() || null;
    if (typeof body.mediaType === 'string' && VALID_MEDIA_TYPES.includes(body.mediaType)) updates.mediaType = body.mediaType;
    if (typeof body.mediaUrl === 'string') {
      const trimmed = body.mediaUrl.trim() || null;
      if (trimmed && !isValidMediaUrl(trimmed)) {
        return res.status(400).json({ ok: false, error: 'mediaUrl must be a valid http or https URL' });
      }
      updates.mediaUrl = trimmed;
    }
    if (typeof body.locationTag === 'string') updates.locationTag = body.locationTag.trim() || null;
    if (Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string')) updates.tags = body.tags;
    if (typeof body.discussionEnabled === 'boolean') updates.discussionEnabled = body.discussionEnabled;

    if (Object.keys(updates).length === 0) return res.json({ ok: true, signal: existing });

    const signal = await prisma.signal.update({ where: { id }, data: updates });
    res.json({ ok: true, signal });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ ok: false, error: 'Signal not found' });
    console.error('[signal] PATCH error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// DELETE /api/signal/:id - Author self-service delete
router.delete('/signal/:id', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const id = req.params.id;
    const existing = await prisma.signal.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) return res.status(404).json({ ok: false, error: 'Signal not found' });
    if (existing.userId !== user.id) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    await prisma.signal.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ ok: false, error: 'Signal not found' });
    console.error('[signal] DELETE error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// POST /api/signal/create
router.post('/signal/create', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    const body = req.body || {};
    const textRaw = body.text;
    if (typeof textRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'text must be a string' });
    }

    const text = textRaw.trim();
    if (text.length < 3) {
      return res.status(400).json({ ok: false, error: 'text must be at least 3 characters' });
    }
    if (text.length > 240) {
      return res.status(400).json({ ok: false, error: 'text must be at most 240 characters' });
    }

    const title = typeof body.title === 'string' ? body.title.trim() || null : null;
    const type = typeof body.type === 'string' && VALID_TYPES.includes(body.type) ? body.type : null;
    const content = typeof body.content === 'string' ? body.content.trim() || null : null;
    const mediaType = typeof body.mediaType === 'string' && VALID_MEDIA_TYPES.includes(body.mediaType) ? body.mediaType : null;
    let mediaUrl = typeof body.mediaUrl === 'string' && body.mediaUrl.trim() ? body.mediaUrl.trim() : null;
    if (mediaUrl && !isValidMediaUrl(mediaUrl)) {
      return res.status(400).json({ ok: false, error: 'mediaUrl must be a valid http or https URL' });
    }
    const locationTag = typeof body.locationTag === 'string' ? body.locationTag.trim() || null : null;
    const tags = Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string') ? body.tags : null;
    const discussionEnabled = typeof body.discussionEnabled === 'boolean' ? body.discussionEnabled : true;

    const purchaseCount = await prisma.purchase.count({ where: { userId: user.id } });
    const conversions = await prisma.referralConversion.findMany({
      where: { buyerEmail: user.email },
      select: { id: true },
    });
    const hasPurchase = purchaseCount > 0 || conversions.length > 0;

    const rollup = await getPointsRollupForUser(prisma, user.id);
    const isContestOfficial = (rollup?.totalPoints || 0) >= 250;

    const hasLink = containsLink(text);
    const hasProfanity = containsProfanity(text);
    let status = 'HELD';
    let heldReason = null;

    if (hasPurchase || isContestOfficial) status = 'APPROVED';
    if (hasLink) {
      status = 'HELD';
      heldReason = 'LINK';
    } else if (hasProfanity) {
      status = 'HELD';
      heldReason = 'PROFANITY';
    }

    // Beta: first-party uploaded video always held for review (even for purchasers).
    // Images/documents on blob follow normal purchase/official approval (faster publish, fewer “missing” posts).
    if (mediaUrl && mediaType === 'video' && isFirstPartyUploadedMediaUrl(mediaUrl)) {
      status = 'HELD';
      heldReason = 'MEDIA_UPLOAD';
    }

    const AUTO_APPROVE = process.env.NODE_ENV === 'development' && process.env.AUTO_APPROVE_USER_CONTENT === 'true';
    if (AUTO_APPROVE && status === 'HELD') {
      status = 'APPROVED';
      heldReason = null;
    }

    const countryCode = req.headers['x-vercel-ip-country'] || null;
    const region = req.headers['x-vercel-ip-country-region'] || null;

    const signal = await prisma.signal.create({
      data: {
        text,
        title: title ?? undefined,
        type: type ?? undefined,
        content: content ?? undefined,
        mediaType: mediaType ?? undefined,
        mediaUrl: mediaUrl ?? undefined,
        locationTag: locationTag ?? undefined,
        tags: tags ?? undefined,
        discussionEnabled,
        status,
        heldReason,
        isSystem: false,
        userId: user.id,
        countryCode,
        region,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        heldAt: status === 'HELD' ? new Date() : null,
      },
    });

    res.json({
      ok: true,
      status,
      signalId: signal.id,
      createdAt: signal.createdAt,
      heldReason: status === 'HELD' ? heldReason : null,
      mediaType: signal.mediaType ?? null,
      mediaUrl: signal.mediaUrl ?? null,
    });
  } catch (err) {
    console.error('[signal/create] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// POST /api/signal/reply
router.post('/signal/reply', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const { signalId, text: textRaw } = req.body || {};
    if (typeof signalId !== 'string' || !signalId) {
      return res.status(400).json({ ok: false, error: 'signalId is required' });
    }
    if (typeof textRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'text must be a string' });
    }

    const text = textRaw.trim();
    if (text.length < 3 || text.length > 240) {
      return res.status(400).json({ ok: false, error: 'text must be 3-240 characters' });
    }

    const signal = await prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found' });

    const reply = await prisma.signalReply.create({
      data: { signalId, userId: user.id, text, isAnonymous: false },
    });

    res.json({ ok: true, replyId: reply.id });
  } catch (err) {
    console.error('[signal/reply] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// POST /api/signal/comment
router.post('/signal/comment', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const { signalId, commentText: commentTextRaw } = req.body || {};
    if (typeof signalId !== 'string' || !signalId) {
      return res.status(400).json({ ok: false, error: 'signalId is required' });
    }
    if (typeof commentTextRaw !== 'string') {
      return res.status(400).json({ ok: false, error: 'commentText must be a string' });
    }

    const commentText = commentTextRaw.trim();
    if (commentText.length < 3 || commentText.length > 500) {
      return res.status(400).json({ ok: false, error: 'Comment must be 3-500 characters' });
    }

    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      select: { id: true, discussionEnabled: true },
    });
    if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found' });
    if (!signal.discussionEnabled) {
      return res.status(403).json({ ok: false, error: 'Discussion is disabled for this signal' });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.signalComment.count({
      where: { signalId, userId: user.id, createdAt: { gte: oneHourAgo } },
    });
    if (recentCount >= 3) {
      return res.status(429).json({ ok: false, error: 'Rate limit: max 3 comments per signal per hour' });
    }

    const isFlagged = containsLink(commentText) || containsProfanity(commentText) || containsSpam(commentText);
    const flagReason = containsLink(commentText) ? 'LINK' : containsProfanity(commentText) ? 'PROFANITY' : containsSpam(commentText) ? 'SPAM' : null;

    const comment = await prisma.signalComment.create({
      data: {
        signalId,
        userId: user.id,
        commentText,
        isFlagged: !!isFlagged,
        flagReason: flagReason || undefined,
      },
    });

    res.json({ ok: true, commentId: comment.id, isFlagged });
  } catch (err) {
    console.error('[signal/comment] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// POST /api/signal/comment-upvote
router.post('/signal/comment-upvote', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const { commentId } = req.body || {};
    if (typeof commentId !== 'string' || !commentId) {
      return res.status(400).json({ ok: false, error: 'commentId is required' });
    }

    const comment = await prisma.signalComment.findUnique({
      where: { id: commentId },
      include: { upvoteRecords: { where: { userId: user.id }, select: { id: true } } },
    });
    if (!comment) return res.status(404).json({ ok: false, error: 'Comment not found' });

    const existing = comment.upvoteRecords[0];
    if (existing) {
      await prisma.$transaction([
        prisma.signalCommentUpvote.delete({ where: { id: existing.id } }),
        prisma.signalComment.update({
          where: { id: commentId },
          data: { upvotes: Math.max(0, comment.upvotes - 1) },
        }),
      ]);
      return res.json({ ok: true, upvoted: false });
    }

    await prisma.$transaction([
      prisma.signalCommentUpvote.create({ data: { commentId, userId: user.id } }),
      prisma.signalComment.update({
        where: { id: commentId },
        data: { upvotes: comment.upvotes + 1 },
      }),
    ]);
    res.json({ ok: true, upvoted: true });
  } catch (err) {
    console.error('[signal/comment-upvote] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// POST /api/signal/ack
router.post('/signal/ack', async (req, res) => {
  try {
    const user = await resolveUserByEmail(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const { signalId } = req.body || {};
    if (typeof signalId !== 'string' || !signalId) {
      return res.status(400).json({ ok: false, error: 'signalId is required' });
    }

    const existing = await prisma.signalAcknowledge.findUnique({
      where: { signalId_userId: { signalId, userId: user.id } },
    });

    if (existing) {
      await prisma.signalAcknowledge.delete({ where: { id: existing.id } });
      const count = await prisma.signalAcknowledge.count({ where: { signalId } });
      return res.json({ ok: true, acknowledged: false, count });
    }

    await prisma.signalAcknowledge.create({
      data: { signalId, userId: user.id },
    });
    const count = await prisma.signalAcknowledge.count({ where: { signalId } });
    res.json({ ok: true, acknowledged: true, count });
  } catch (err) {
    console.error('[signal/ack] Error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// --- Admin routes ---

// GET /api/admin/signals
router.get('/admin/signals', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const signals = await prisma.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { email: true, firstName: true } },
        _count: { select: { comments: true, replies: true } },
      },
    });
    res.json({ ok: true, signals });
  } catch (err) {
    console.error('[admin/signals] Error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// POST /api/admin/signals
router.post('/admin/signals', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 3) return res.status(400).json({ error: 'text must be at least 3 characters' });

    const title = typeof body.title === 'string' ? body.title.trim() || null : null;
    const type = typeof body.type === 'string' && VALID_TYPES.includes(body.type) ? body.type : null;
    const content = typeof body.content === 'string' ? body.content.trim() || null : null;
    const mediaType = typeof body.mediaType === 'string' && VALID_MEDIA_TYPES.includes(body.mediaType) ? body.mediaType : null;
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() || null : null;
    const locationTag = typeof body.locationTag === 'string' ? body.locationTag.trim() || null : null;
    const locationName = typeof body.locationName === 'string' ? body.locationName.trim() || null : null;
    const locationLat = typeof body.locationLat === 'number' ? body.locationLat : null;
    const locationLng = typeof body.locationLng === 'number' ? body.locationLng : null;
    const tags = Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string') ? body.tags : null;
    const discussionEnabled = typeof body.discussionEnabled === 'boolean' ? body.discussionEnabled : true;
    const publishStatus = body.publishStatus === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    const publishAt = body.publishAt ? new Date(body.publishAt) : null;
    const author = typeof body.author === 'string' ? body.author.trim() || null : null;

    const signal = await prisma.signal.create({
      data: {
        text,
        title: title ?? undefined,
        type: type ?? undefined,
        content: content ?? undefined,
        mediaType: mediaUrl ? (mediaType ?? 'image') : undefined,
        mediaUrl: mediaUrl ?? undefined,
        locationTag: locationTag ?? undefined,
        locationName: locationName ?? undefined,
        locationLat: locationLat ?? undefined,
        locationLng: locationLng ?? undefined,
        tags: tags ?? undefined,
        discussionEnabled,
        publishStatus,
        publishAt: publishAt ?? undefined,
        author: author ?? undefined,
        isSystem: true,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });

    if (publishStatus === 'PUBLISHED' && !publishAt) {
      await createSignalEvent(signal.id);
    }

    res.json({ ok: true, signalId: signal.id, signal });
  } catch (err) {
    console.error('[admin/signals] Create error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// GET /api/admin/signals/:id
router.get('/admin/signals/:id', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const signal = await prisma.signal.findUnique({ where: { id: req.params.id } });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json({ ok: true, signal });
  } catch (err) {
    console.error('[admin/signals] Get error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// PATCH /api/admin/signals/:id
router.patch('/admin/signals/:id', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const id = req.params.id;
    const body = req.body || {};
    const updates = {};

    if (typeof body.text === 'string' && body.text.trim().length >= 3) updates.text = body.text.trim();
    if (typeof body.title === 'string') updates.title = body.title.trim() || null;
    if (typeof body.type === 'string' && VALID_TYPES.includes(body.type)) updates.type = body.type;
    if (typeof body.content === 'string') updates.content = body.content.trim() || null;
    if (typeof body.mediaType === 'string' && VALID_MEDIA_TYPES.includes(body.mediaType)) updates.mediaType = body.mediaType;
    if (typeof body.mediaUrl === 'string') updates.mediaUrl = body.mediaUrl.trim() || null;
    if (typeof body.locationTag === 'string') updates.locationTag = body.locationTag.trim() || null;
    if (typeof body.locationName === 'string') updates.locationName = body.locationName.trim() || null;
    if (typeof body.locationLat === 'number') updates.locationLat = body.locationLat;
    if (typeof body.locationLng === 'number') updates.locationLng = body.locationLng;
    if (Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string')) updates.tags = body.tags;
    if (typeof body.discussionEnabled === 'boolean') updates.discussionEnabled = body.discussionEnabled;
    if (body.publishStatus === 'DRAFT' || body.publishStatus === 'PUBLISHED') updates.publishStatus = body.publishStatus;
    if (body.publishAt !== undefined) updates.publishAt = body.publishAt ? new Date(body.publishAt) : null;
    if (typeof body.author === 'string') updates.author = body.author.trim() || null;

    const existing = await prisma.signal.findUnique({ where: { id }, select: { publishStatus: true } });
    const signal = await prisma.signal.update({ where: { id }, data: updates });

    const newlyPublished = signal.publishStatus === 'PUBLISHED' && (existing?.publishStatus === 'DRAFT' || existing?.publishStatus == null);
    if (newlyPublished) await createSignalEvent(id);

    res.json({ ok: true, signal });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Signal not found' });
    console.error('[admin/signals] Update error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// DELETE /api/admin/signals/:id
router.delete('/admin/signals/:id', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await prisma.signal.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Signal not found' });
    console.error('[admin/signals] Delete error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// POST /api/admin/signals/:id/publish
router.post('/admin/signals/:id/publish', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const id = req.params.id;
    const body = req.body || {};
    const eventText = typeof body.eventText === 'string' ? body.eventText : undefined;

    const signal = await prisma.signal.update({
      where: { id },
      data: { publishStatus: 'PUBLISHED', publishAt: null },
    });
    await createSignalEvent(id, eventText);
    res.json({ ok: true, signal });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Signal not found' });
    console.error('[admin/signals] Publish error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// GET /api/cron/publish-scheduled-signals
router.get('/cron/publish-scheduled-signals', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const toPublish = await prisma.signal.findMany({
      where: { publishStatus: 'DRAFT', publishAt: { lte: now } },
      select: { id: true },
    });

    let published = 0;
    for (const s of toPublish) {
      await prisma.signal.update({
        where: { id: s.id },
        data: { publishStatus: 'PUBLISHED', publishAt: null },
      });
      await createSignalEvent(s.id);
      published++;
    }
    res.json({ ok: true, published });
  } catch (err) {
    console.error('[cron/publish-scheduled-signals] Error', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

module.exports = router;
