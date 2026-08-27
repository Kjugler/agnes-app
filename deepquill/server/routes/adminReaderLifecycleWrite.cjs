/**
 * POST-only admin API for Reader Manager lifecycle mutations (Checkpoint 5C).
 * Isolated namespace: /api/admin/reader-lifecycle
 * Exact routes only. Domain logic lives in readerLifecycleWrite.cjs.
 *
 * Mount BEFORE the GET-only lifecycle router so approved POSTs are handled
 * here and every other method/path falls through to GET-only 405/404 behavior.
 */
const crypto = require('crypto');
const express = require('express');
const {
  createReaderLifecycleWriteService,
  LifecycleWriteError,
  ADD_KINDS,
  IDENTITY_REASON_CODES,
  ARCHIVE_REASON_CODES,
} = require('../../lib/readers/readerLifecycleWrite.cjs');

const MAX_ID_LENGTH = 128;
const MAX_REASON = 500;
const MIN_REASON = 8;
const MAX_DETAILS = 2000;
const MAX_IDEMPOTENCY = 128;
const MIN_IDEMPOTENCY = 8;
const FORBIDDEN_ERROR = 'Forbidden - x-admin-key required in production';
const MUTATIONS_DISABLED_ERROR = 'lifecycle_mutations_disabled';
const MUTATIONS_ENABLED_ENV = 'READER_LIFECYCLE_MUTATIONS_ENABLED';
const MUTATIONS_ENABLED_VALUE = '1';
const POLLUTION_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);
const FORBIDDEN_BODY_KEYS = Object.freeze([
  'stripeSessionId',
  'sessionId',
  'origin',
  'originRef',
  'actorLabel',
  'actorType',
  'adminKey',
  'ADMIN_KEY',
  'x-admin-key',
  'idempotencyKey',
  'Idempotency-Key',
]);
const CURRENT_STATUSES = Object.freeze(['provisional', 'confirmed']);
const MUTABLE_KINDS = Object.freeze([...ADD_KINDS, 'kris_personal_knowledge']);
const DECISIONS = Object.freeze(['suppress', 'allow']);
const RESOLUTION_STATUSES = Object.freeze(['dismissed', 'resolved_keep_separate']);
const ADD_FIELDS = Object.freeze(['kind', 'purchaseDate', 'details', 'reason', 'actorId', 'sourceLabel']);
const CONFIRM_FIELDS = Object.freeze(['reason', 'actorId', 'expectedStatus']);
const CORRECT_FIELDS = Object.freeze([
  'reason',
  'actorId',
  'expectedStatus',
  'kind',
  'status',
  'purchaseDate',
  'details',
  'sourceLabel',
]);
const DISPUTE_FIELDS = Object.freeze(['reason', 'actorId', 'expectedStatus']);
const REPLACE_FIELDS = Object.freeze([
  'reason',
  'actorId',
  'expectedStatus',
  'kind',
  'status',
  'purchaseDate',
  'details',
  'sourceLabel',
]);
const DECISION_FIELDS = Object.freeze(['decision', 'reason', 'actorId']);
const OPEN_REVIEW_FIELDS = Object.freeze(['reasonCode', 'details', 'otherUserId', 'reason', 'actorId']);
const RESOLVE_FIELDS = Object.freeze(['status', 'resolutionReason', 'actorId', 'expectedStatus']);
const ARCHIVE_FIELDS = Object.freeze(['reasonCode', 'details', 'reason', 'actorId', 'expectedStatus', 'confirmed']);
const RESTORE_FIELDS = Object.freeze(['reason', 'actorId', 'expectedStatus', 'confirmed']);
const DUPLICATE_ARCHIVE_WARNING =
  'Genuine duplicate-person uncertainty normally belongs in Identity Review. Archive does not merge or delete identities.';

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

function lifecycleMutationsEnabled(env = process.env) {
  return env[MUTATIONS_ENABLED_ENV] === MUTATIONS_ENABLED_VALUE;
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
  return res.status(200).json(payload);
}

function httpError(status, error) {
  const err = new Error(error);
  err.status = status;
  err.expose = true;
  err.code = error;
  return err;
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
    namespace: 'admin-reader-lifecycle-write',
    method: req.method,
    route,
    errorName: safeErrorName(err),
    message: 'internal lifecycle mutation failed',
  };
  const code = safeErrorCode(err);
  if (code !== undefined) payload.code = code;
  console.error('[admin-reader-lifecycle-write]', payload);
}

function requirePlainObject(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_request');
  }
  const keys = Object.keys(body);
  for (const key of keys) {
    if (POLLUTION_KEYS.includes(key)) throw httpError(400, 'invalid_request');
    if (FORBIDDEN_BODY_KEYS.includes(key)) throw httpError(400, 'unknown_field');
  }
  return body;
}

function allowFields(body, allowed) {
  const src = requirePlainObject(body);
  for (const key of Object.keys(src)) {
    if (!allowed.includes(key)) throw httpError(400, 'unknown_field');
  }
  return src;
}

function parseId(raw) {
  if (raw == null) throw httpError(400, 'invalid_id');
  if (typeof raw !== 'string' && typeof raw !== 'number') throw httpError(400, 'invalid_id');
  const value = String(raw).trim();
  if (!value || value.length > MAX_ID_LENGTH) throw httpError(400, 'invalid_id');
  return value;
}

function parseRequiredString(raw, key, { min = 1, max }) {
  if (raw == null || typeof raw !== 'string') throw httpError(400, `invalid_${key}`);
  const value = raw.trim();
  if (value.length < min || value.length > max) throw httpError(400, `invalid_${key}`);
  return value;
}

function parseOptionalString(raw, key, max) {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw httpError(400, `invalid_${key}`);
  const value = raw.trim();
  if (!value) return null;
  if (value.length > max) throw httpError(400, `invalid_${key}`);
  return value;
}

function parseReason(raw) {
  return parseRequiredString(raw, 'reason', { min: MIN_REASON, max: MAX_REASON });
}

function parseEnum(raw, allowed, key) {
  if (raw == null || typeof raw !== 'string') throw httpError(400, `invalid_${key}`);
  const value = raw.trim();
  if (!allowed.includes(value)) throw httpError(400, `invalid_${key}`);
  return value;
}

function parseConfirmed(raw) {
  if (raw !== true) throw httpError(400, 'confirmation_required');
  return true;
}

function parseOptionalEnum(raw, allowed, key) {
  if (raw == null) return undefined;
  return parseEnum(raw, allowed, key);
}

function parseOptionalDate(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw httpError(400, 'invalid_purchase_date');
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) throw httpError(400, 'invalid_purchase_date');
  return d.toISOString();
}

function rejectProtectedKind(kind) {
  if (kind === 'website_stripe' || kind === 'aggregate_marketing_not_individual') {
    throw httpError(409, 'website_purchase_protected');
  }
}

function parseIdempotencyKey(req) {
  const raw = req.headers['idempotency-key'];
  if (raw == null) throw httpError(400, 'invalid_idempotency_key');
  if (Array.isArray(raw)) throw httpError(400, 'invalid_idempotency_key');
  if (typeof raw !== 'string') throw httpError(400, 'invalid_idempotency_key');
  if (raw.includes(',')) throw httpError(400, 'invalid_idempotency_key');
  const key = raw.trim();
  if (key.length < MIN_IDEMPOTENCY || key.length > MAX_IDEMPOTENCY) {
    throw httpError(400, 'invalid_idempotency_key');
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) throw httpError(400, 'invalid_idempotency_key');
  return key;
}

function mapWriteError(err) {
  if (err instanceof LifecycleWriteError && err.httpStatus && typeof err.code === 'string') {
    if ([400, 404, 409].includes(err.httpStatus)) {
      return { status: err.httpStatus, error: err.code };
    }
  }
  if (err && err.name === 'LifecycleWriteError' && err.httpStatus && typeof err.code === 'string') {
    if ([400, 404, 409].includes(err.httpStatus)) {
      return { status: err.httpStatus, error: err.code };
    }
  }
  return null;
}

function successBody(result) {
  return {
    ok: true,
    replay: Boolean(result.replay),
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    mutation: result.mutation,
    reader: result.reader,
  };
}

function createAdminReaderLifecycleWriteRouter(prisma) {
  if (!prisma || typeof prisma !== 'object') {
    throw new Error('prisma client is required');
  }
  const writes = createReaderLifecycleWriteService(prisma);
  const router = express.Router();

  router.use((req, res, next) => {
    setNoStore(res);
    if (req.method === 'POST' && !lifecycleMutationsEnabled()) {
      return sendError(res, 503, MUTATIONS_DISABLED_ERROR);
    }
    next();
  });

  async function guarded(req, res, fn) {
    setNoStore(res);
    if (!isAdminAuthorized(req)) {
      return sendError(res, 403, FORBIDDEN_ERROR);
    }
    try {
      const result = await fn();
      return sendOk(res, successBody(result));
    } catch (err) {
      if (err && err.expose && err.status) {
        return sendError(res, err.status, err.code || err.message);
      }
      const mapped = mapWriteError(err);
      if (mapped) return sendError(res, mapped.status, mapped.error);
      logInternalError(req, err);
      return sendError(res, 500, 'Internal error');
    }
  }

  router.post('/readers/:readerProfileId/evidence', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId);
      const body = allowFields(req.body, ADD_FIELDS);
      rejectProtectedKind(typeof body.kind === 'string' ? body.kind.trim() : body.kind);
      const kind = parseEnum(body.kind, ADD_KINDS, 'kind');
      return writes.addEvidence({
        readerProfileId,
        kind,
        purchaseDate: parseOptionalDate(body.purchaseDate),
        details: parseOptionalString(body.details, 'details', MAX_DETAILS),
        sourceLabel: parseOptionalString(body.sourceLabel, 'sourceLabel', 80),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/evidence/:evidenceId/confirm', (req, res) =>
    guarded(req, res, async () => {
      const evidenceId = parseId(req.params.evidenceId);
      const body = allowFields(req.body, CONFIRM_FIELDS);
      return writes.confirmEvidence({
        evidenceId,
        expectedStatus: parseEnum(body.expectedStatus, ['provisional'], 'expectedStatus'),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/evidence/:evidenceId/correct', (req, res) =>
    guarded(req, res, async () => {
      const evidenceId = parseId(req.params.evidenceId);
      const body = allowFields(req.body, CORRECT_FIELDS);
      if (body.kind != null) rejectProtectedKind(String(body.kind).trim());
      return writes.correctEvidence({
        evidenceId,
        expectedStatus: parseEnum(body.expectedStatus, CURRENT_STATUSES, 'expectedStatus'),
        kind: parseOptionalEnum(body.kind, MUTABLE_KINDS, 'kind'),
        status: parseOptionalEnum(body.status, CURRENT_STATUSES, 'status'),
        purchaseDate: body.purchaseDate === undefined ? undefined : parseOptionalDate(body.purchaseDate),
        details: body.details === undefined ? undefined : parseOptionalString(body.details, 'details', MAX_DETAILS),
        sourceLabel:
          body.sourceLabel === undefined
            ? undefined
            : parseOptionalString(body.sourceLabel, 'sourceLabel', 80),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/evidence/:evidenceId/dispute', (req, res) =>
    guarded(req, res, async () => {
      const evidenceId = parseId(req.params.evidenceId);
      const body = allowFields(req.body, DISPUTE_FIELDS);
      return writes.disputeEvidence({
        evidenceId,
        expectedStatus: parseEnum(body.expectedStatus, CURRENT_STATUSES, 'expectedStatus'),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/evidence/:evidenceId/replace', (req, res) =>
    guarded(req, res, async () => {
      const evidenceId = parseId(req.params.evidenceId);
      const body = allowFields(req.body, REPLACE_FIELDS);
      if (body.kind != null) rejectProtectedKind(String(body.kind).trim());
      return writes.replaceEvidence({
        evidenceId,
        expectedStatus: parseEnum(body.expectedStatus, ['disputed'], 'expectedStatus'),
        kind: parseOptionalEnum(body.kind, MUTABLE_KINDS, 'kind'),
        status: parseOptionalEnum(body.status, CURRENT_STATUSES, 'status'),
        purchaseDate: body.purchaseDate === undefined ? undefined : parseOptionalDate(body.purchaseDate),
        details: body.details === undefined ? undefined : parseOptionalString(body.details, 'details', MAX_DETAILS),
        sourceLabel:
          body.sourceLabel === undefined
            ? undefined
            : parseOptionalString(body.sourceLabel, 'sourceLabel', 80),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/readers/:readerProfileId/contact-decisions', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId);
      const body = allowFields(req.body, DECISION_FIELDS);
      return writes.addContactDecision({
        readerProfileId,
        decision: parseEnum(body.decision, DECISIONS, 'decision'),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/readers/:readerProfileId/identity-reviews', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId);
      const body = allowFields(req.body, OPEN_REVIEW_FIELDS);
      const reasonCode = parseEnum(body.reasonCode, IDENTITY_REASON_CODES, 'reasonCode');
      const details = parseOptionalString(body.details, 'details', MAX_DETAILS);
      if (reasonCode === 'other' && (!details || details.length < MIN_REASON)) {
        throw httpError(400, 'invalid_details');
      }
      return writes.openIdentityReview({
        readerProfileId,
        reasonCode,
        details,
        otherUserId: body.otherUserId == null ? null : parseId(body.otherUserId),
        reason: parseReason(body.reason),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/identity-reviews/:reviewId/resolve', (req, res) =>
    guarded(req, res, async () => {
      const reviewId = parseId(req.params.reviewId);
      const body = allowFields(req.body, RESOLVE_FIELDS);
      return writes.resolveIdentityReview({
        reviewId,
        status: parseEnum(body.status, RESOLUTION_STATUSES, 'status'),
        resolutionReason: parseReason(body.resolutionReason),
        expectedStatus: parseEnum(body.expectedStatus, ['open'], 'expectedStatus'),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  router.post('/readers/:readerProfileId/archive', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId);
      const body = allowFields(req.body, ARCHIVE_FIELDS);
      const reasonCode = parseEnum(body.reasonCode, [...ARCHIVE_REASON_CODES], 'reasonCode');
      const details = parseOptionalString(body.details, 'details', MAX_DETAILS);
      if (reasonCode === 'other' && (!details || details.length < MIN_REASON)) {
        throw httpError(400, 'invalid_details');
      }
      const result = await writes.archiveReader({
        readerProfileId,
        reasonCode,
        details,
        reason: parseReason(body.reason),
        expectedStatus: parseEnum(body.expectedStatus, ['active', 'inactive'], 'expectedStatus'),
        confirmed: parseConfirmed(body.confirmed),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
      if (reasonCode === 'duplicate_or_identity_issue' && Array.isArray(result.warnings)) {
        if (!result.warnings.includes(DUPLICATE_ARCHIVE_WARNING)) {
          result.warnings = [DUPLICATE_ARCHIVE_WARNING, ...result.warnings];
        }
      }
      return result;
    }),
  );

  router.post('/readers/:readerProfileId/restore', (req, res) =>
    guarded(req, res, async () => {
      const readerProfileId = parseId(req.params.readerProfileId);
      const body = allowFields(req.body, RESTORE_FIELDS);
      return writes.restoreReader({
        readerProfileId,
        reason: parseReason(body.reason),
        expectedStatus: parseEnum(body.expectedStatus, ['archived'], 'expectedStatus'),
        confirmed: parseConfirmed(body.confirmed),
        actorId: parseId(body.actorId),
        idempotencyKey: parseIdempotencyKey(req),
      });
    }),
  );

  return router;
}

module.exports = createAdminReaderLifecycleWriteRouter;
module.exports.createAdminReaderLifecycleWriteRouter = createAdminReaderLifecycleWriteRouter;
module.exports.isAdminAuthorized = isAdminAuthorized;
module.exports.lifecycleMutationsEnabled = lifecycleMutationsEnabled;
module.exports.FORBIDDEN_ERROR = FORBIDDEN_ERROR;
module.exports.MUTATIONS_DISABLED_ERROR = MUTATIONS_DISABLED_ERROR;
module.exports.MUTATIONS_ENABLED_ENV = MUTATIONS_ENABLED_ENV;
