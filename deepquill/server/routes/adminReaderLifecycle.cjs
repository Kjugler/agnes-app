/**
 * GET-only admin API for Reader Manager lifecycle reads (Checkpoint 3B).
 * Isolated namespace: /api/admin/reader-lifecycle
 * Does not replace /api/admin/readers.
 *
 * Auth: x-admin-key compared to ADMIN_KEY (same header/env as other admin
 * routes). No development bypass — this namespace is never public.
 */
const crypto = require('crypto');
const express = require('express');
const {
  OWNERSHIP,
  SOURCE,
  CONFIDENCE,
  CONTACTABILITY,
  REVIEW,
} = require('../../lib/readers/classifyReader.cjs');
const {
  listReaderLifecycle,
  getReaderLifecycleDetail,
  listReviewQueue,
  listCommunicationActivity,
  listPurchasesWithoutReaderProfile,
  listLifecycleActors,
  listReaderAuditHistory,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PRIMARY_QUEUES,
} = require('../../lib/readers/readerLifecycleRead.cjs');

const MAX_CURSOR_LENGTH = 512;
const MAX_Q_LENGTH = 200;
const MAX_ID_LENGTH = 128;
const MAX_CRM_STRING = 80;

const OWNERSHIP_VALUES = Object.freeze(Object.values(OWNERSHIP));
const CONFIDENCE_VALUES = Object.freeze(Object.values(CONFIDENCE));
const CONTACTABILITY_VALUES = Object.freeze(Object.values(CONTACTABILITY));
const REVIEW_VALUES = Object.freeze(Object.values(REVIEW));
const PURCHASE_SOURCE_VALUES = Object.freeze(Object.values(SOURCE));
const REVIEW_QUEUE_KINDS = Object.freeze([
  'identity_open',
  'conflicting',
  'incomplete',
  'legacy_purchased_without_evidence',
  'archived_beta_only',
  'purchase_without_profile',
]);
const COMMUNICATION_CATEGORIES = Object.freeze([
  'reader_recommendation_taf',
  'purchase_confirmation',
  'other',
]);
const COMMUNICATION_OUTCOMES = Object.freeze([
  'accepted',
  'rejected',
  'failed',
  'recorded_sent_delivery_unknown',
  'unknown',
]);
const COMMUNICATION_TRIGGERS = Object.freeze([
  'automatic_job',
  'webhook',
  'manual',
  'unknown',
]);
const CRM_STATUSES = Object.freeze(['active', 'inactive', 'archived']);

const FORBIDDEN_ERROR = 'Forbidden - x-admin-key required in production';

function timingSafeEqualString(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    if (a.length > 0) crypto.timingSafeEqual(a, a);
    return false;
  }
  if (a.length === 0) return true;
  return crypto.timingSafeEqual(a, b);
}

function headerValue(req, name) {
  const raw = req.headers[name];
  if (raw == null) return '';
  return Array.isArray(raw) ? String(raw[0] || '') : String(raw);
}

function isAdminAuthorized(req) {
  try {
    const expected = process.env.ADMIN_KEY ? String(process.env.ADMIN_KEY) : '';
    if (!expected) return false;
    return timingSafeEqualString(headerValue(req, 'x-admin-key'), expected);
  } catch {
    return false;
  }
}

function setNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

function sendError(res, status, error) {
  setNoStore(res);
  return res.status(status).json({ ok: false, error });
}

function sendOk(res, payload) {
  setNoStore(res);
  return res.json({ ok: true, ...payload });
}

function httpError(status, error) {
  const err = new Error(error);
  err.status = status;
  err.expose = true;
  return err;
}

function scalar(query, key) {
  const value = query[key];
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) throw httpError(400, `Invalid ${key}`);
  return String(value);
}

function parsePageSize(raw) {
  if (raw == null) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(raw)) throw httpError(400, 'Invalid pageSize');
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
    throw httpError(400, 'Invalid pageSize');
  }
  return n;
}

function parseBoolean(raw, key) {
  if (raw == null) return undefined;
  const v = String(raw).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw httpError(400, `Invalid ${key}`);
}

function parseEnum(raw, allowed, key) {
  if (raw == null) return undefined;
  if (!allowed.includes(raw)) throw httpError(400, `Invalid ${key}`);
  return raw;
}

function parseLimitedString(raw, key, max) {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw httpError(400, `Invalid ${key}`);
  return trimmed;
}

function parseId(raw, key) {
  const value = parseLimitedString(raw, key, MAX_ID_LENGTH);
  if (!value) throw httpError(400, `Invalid ${key}`);
  return value;
}

function parseCursor(raw, kind) {
  if (raw == null) return undefined;
  if (raw.length > MAX_CURSOR_LENGTH) throw httpError(400, 'Invalid cursor');
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw httpError(400, 'Invalid cursor');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(400, 'Invalid cursor');
  }
  if (kind === 'occurredAt') {
    if (!parsed.occurredAt || !parsed.id) throw httpError(400, 'Invalid cursor');
  } else if (!parsed.createdAt || !parsed.id) {
    throw httpError(400, 'Invalid cursor');
  }
  return raw;
}

function parseDate(raw, key) {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) throw httpError(400, `Invalid ${key}`);
  return d.toISOString();
}

function resolveCrmStatusFilter(statusRaw, includeArchived) {
  if (statusRaw && CRM_STATUSES.includes(statusRaw)) {
    return { status: statusRaw };
  }
  if (statusRaw === 'all' || includeArchived === true) {
    return { includeArchived: true };
  }
  return {};
}

function parseListQuery(query) {
  const pageSize = parsePageSize(scalar(query, 'pageSize'));
  const cursor = parseCursor(scalar(query, 'cursor'), 'createdAt');
  const q = parseLimitedString(scalar(query, 'q'), 'q', MAX_Q_LENGTH);
  const includeArchived = parseBoolean(scalar(query, 'includeArchived'), 'includeArchived');
  const ownership = parseEnum(scalar(query, 'ownership'), OWNERSHIP_VALUES, 'ownership');
  const confidence = parseEnum(scalar(query, 'confidence'), CONFIDENCE_VALUES, 'confidence');
  const contactability = parseEnum(
    scalar(query, 'contactability'),
    CONTACTABILITY_VALUES,
    'contactability',
  );
  const review = parseEnum(scalar(query, 'review'), REVIEW_VALUES, 'review');
  const purchaseSource = parseEnum(
    scalar(query, 'purchaseSource'),
    PURCHASE_SOURCE_VALUES,
    'purchaseSource',
  );
  const source = parseLimitedString(scalar(query, 'source'), 'source', MAX_CRM_STRING);
  const statusRaw = parseLimitedString(scalar(query, 'status'), 'status', MAX_CRM_STRING);
  const queue = parseEnum(scalar(query, 'queue'), PRIMARY_QUEUES, 'queue');
  if (statusRaw && statusRaw !== 'all' && !CRM_STATUSES.includes(statusRaw)) {
    throw httpError(400, 'Invalid status');
  }
  return {
    pageSize,
    cursor,
    q,
    ownership,
    confidence,
    contactability,
    review,
    purchaseSource,
    source,
    queue,
    ...resolveCrmStatusFilter(statusRaw, includeArchived),
  };
}

function parseReviewQuery(query) {
  const kind = parseEnum(scalar(query, 'kind'), REVIEW_QUEUE_KINDS, 'kind') || 'incomplete';
  const base = parseListQuery(query);
  return { ...base, kind };
}

function parseCommunicationQuery(query) {
  const pageSize = parsePageSize(scalar(query, 'pageSize'));
  const cursor = parseCursor(scalar(query, 'cursor'), 'occurredAt');
  const q = parseLimitedString(scalar(query, 'q'), 'q', MAX_Q_LENGTH);
  const category = parseEnum(scalar(query, 'category'), COMMUNICATION_CATEGORIES, 'category');
  const outcome = parseEnum(scalar(query, 'outcome'), COMMUNICATION_OUTCOMES, 'outcome');
  const trigger = parseEnum(scalar(query, 'trigger'), COMMUNICATION_TRIGGERS, 'trigger');
  const from = parseDate(scalar(query, 'from'), 'from');
  const to = parseDate(scalar(query, 'to'), 'to');
  if (from && to && new Date(from) > new Date(to)) {
    throw httpError(400, 'Invalid date range');
  }
  return { pageSize, cursor, q, category, outcome, trigger, from, to };
}

function compact(options) {
  const out = {};
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function safeErrorName(err) {
  const name = err && typeof err.name === 'string' ? err.name : 'Error';
  return /^[A-Za-z][A-Za-z0-9]{0,80}$/.test(name) ? name : 'Error';
}

function safeErrorCode(err) {
  const code = err && err.code;
  if (typeof code === 'string' && /^(P\d{4}|E[A-Z0-9_]{1,32})$/.test(code)) return code;
  return undefined;
}

function logInternalError(req, err) {
  const route = req.route && typeof req.route.path === 'string' ? req.route.path : 'unknown';
  const payload = {
    namespace: 'admin-reader-lifecycle',
    method: req.method,
    route,
    errorName: safeErrorName(err),
    message: 'internal lifecycle read failed',
  };
  const code = safeErrorCode(err);
  if (code !== undefined) payload.code = code;
  console.error('[admin-reader-lifecycle]', payload);
}

function createAdminReaderLifecycleRouter(prisma) {
  if (!prisma || typeof prisma !== 'object') {
    throw new Error('prisma client is required');
  }
  const router = express.Router();

  router.use((req, res, next) => {
    setNoStore(res);
    if (!isAdminAuthorized(req)) {
      return sendError(res, 403, FORBIDDEN_ERROR);
    }
    next();
  });

  router.use((req, res, next) => {
    if (req.method !== 'GET') {
      res.set('Allow', 'GET');
      return sendError(res, 405, 'Method not allowed');
    }
    next();
  });

  async function guarded(req, res, fn) {
    try {
      await fn();
    } catch (err) {
      if (err && err.expose && err.status) {
        return sendError(res, err.status, err.message);
      }
      logInternalError(req, err);
      return sendError(res, 500, 'Internal error');
    }
  }

  router.get('/actors', (req, res) =>
    guarded(req, res, async () => {
      const result = await listLifecycleActors(prisma);
      return sendOk(res, result);
    }),
  );

  router.get('/readers', (req, res) =>
    guarded(req, res, async () => {
      const options = compact(parseListQuery(req.query));
      const result = await listReaderLifecycle(prisma, options);
      return sendOk(res, result);
    }),
  );

  router.get('/readers/:readerProfileId/audit-history', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId, 'readerProfileId');
      const pageSize = parsePageSize(scalar(req.query, 'pageSize'));
      const cursor = parseCursor(scalar(req.query, 'cursor'), 'createdAt');
      let result;
      try {
        result = await listReaderAuditHistory(
          prisma,
          compact({ readerProfileId, pageSize, cursor }),
        );
      } catch (err) {
        logInternalError(req, err);
        return sendError(res, 500, 'Internal error');
      }
      if (!result) return sendError(res, 404, 'Not found');
      try {
        JSON.stringify(result);
      } catch (err) {
        logInternalError(req, err);
        return sendError(res, 500, 'Internal error');
      }
      return sendOk(res, result);
    }),
  );

  router.get('/readers/:readerProfileId', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId, 'readerProfileId');
      const detail = await getReaderLifecycleDetail(prisma, { readerProfileId });
      if (!detail) return sendError(res, 404, 'Not found');
      return sendOk(res, { reader: detail });
    }),
  );

  router.get('/users/:userId', (req, res) =>
    guarded(req, res, async () => {
      const userId = parseId(req.params.userId, 'userId');
      const detail = await getReaderLifecycleDetail(prisma, { userId });
      if (!detail) return sendError(res, 404, 'Not found');
      return sendOk(res, { reader: detail });
    }),
  );

  router.get('/review-queue', (req, res) =>
    guarded(req, res, async () => {
      const options = compact(parseReviewQuery(req.query));
      const result = await listReviewQueue(prisma, options);
      return sendOk(res, result);
    }),
  );

  router.get('/communications', (req, res) =>
    guarded(req, res, async () => {
      const options = compact(parseCommunicationQuery(req.query));
      const result = await listCommunicationActivity(prisma, options);
      return sendOk(res, result);
    }),
  );

  router.get('/purchases-without-profile', (req, res) =>
    guarded(req, res, async () => {
      const pageSize = parsePageSize(scalar(req.query, 'pageSize'));
      const cursor = parseCursor(scalar(req.query, 'cursor'), 'createdAt');
      const result = await listPurchasesWithoutReaderProfile(prisma, compact({ pageSize, cursor }));
      return sendOk(res, result);
    }),
  );

  router.use((req, res) => sendError(res, 404, 'Not found'));
  return router;
}

module.exports = createAdminReaderLifecycleRouter;
module.exports.createAdminReaderLifecycleRouter = createAdminReaderLifecycleRouter;
module.exports.MAX_CURSOR_LENGTH = MAX_CURSOR_LENGTH;
module.exports.MAX_Q_LENGTH = MAX_Q_LENGTH;
module.exports.REVIEW_QUEUE_KINDS = REVIEW_QUEUE_KINDS;
module.exports.COMMUNICATION_CATEGORIES = COMMUNICATION_CATEGORIES;
module.exports.COMMUNICATION_OUTCOMES = COMMUNICATION_OUTCOMES;
module.exports.COMMUNICATION_TRIGGERS = COMMUNICATION_TRIGGERS;
module.exports.resolveCrmStatusFilter = resolveCrmStatusFilter;
module.exports.parseListQuery = parseListQuery;
module.exports.isAdminAuthorized = isAdminAuthorized;
