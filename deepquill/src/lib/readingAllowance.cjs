// Signed anonymous sample-reading allowance.
// The browser cannot edit the accumulated time. Qualifying time is the
// server clock between ticks, capped so a client cannot report an arbitrary duration.
// Disjoint typ from readers_agree_session, remember_place, and reader_claim.

const crypto = require('crypto');

const ALLOWANCE_TYP = 'reading_allowance';
const LIMIT_MS = 90_000;
const MAX_CREDIT_MS = 2_500;
const TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 2000;
const SAMPLE_CHAPTER_IDS = new Set(['1', '2', '9', '45']);
const VISITOR_ID = /^[A-Za-z0-9_-]{8,80}$/;

function getSecret() {
  const secret = process.env.FULFILLMENT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[READING_ALLOWANCE] FULFILLMENT_TOKEN_SECRET must be at least 32 characters');
  }
  return secret;
}

function allowanceLimitMs(nodeEnv, raw) {
  const env = String(nodeEnv || '').trim().toLowerCase();
  // A short allowance is only for an explicit local development or test process.
  // Production, a blank environment, and any other environment stay at 90 seconds,
  // even if READING_ALLOWANCE_LIMIT_MS is present.
  if (env !== 'development' && env !== 'test') return LIMIT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1000 || n > LIMIT_MS) return LIMIT_MS;
  return Math.floor(n);
}

function currentLimitMs() {
  return allowanceLimitMs(process.env.NODE_ENV || '', process.env.READING_ALLOWANCE_LIMIT_MS);
}

function signaturesMatch(provided, expected) {
  const sigBuf = Buffer.from(provided, 'base64url');
  const expectedBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expectedBuf.length) {
    if (sigBuf.length > 0) crypto.timingSafeEqual(sigBuf, sigBuf);
    return false;
  }
  if (sigBuf.length === 0) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

function freshAllowanceState(nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    accumulatedMs: 0,
    exhausted: false,
    lastTickAt: now,
    chapterId: null,
    page: 1,
    visitorId: null,
    exp: Math.floor(now / 1000) + TTL_SECONDS,
  };
}

function normalizeChapterId(value) {
  const id = value == null ? '' : String(value);
  return SAMPLE_CHAPTER_IDS.has(id) ? id : null;
}

function normalizePage(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 500) return null;
  return n;
}

function normalizeVisitorId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return VISITOR_ID.test(id) ? id : null;
}

function signAllowanceState(state) {
  const payloadStr = JSON.stringify({
    typ: ALLOWANCE_TYP,
    acc: state.accumulatedMs,
    ex: state.exhausted ? 1 : 0,
    tick: state.lastTickAt,
    ch: state.chapterId,
    pg: state.page,
    vid: state.visitorId,
    exp: state.exp,
  });
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(payloadStr);
  const signature = hmac.digest('base64url');
  return `${Buffer.from(payloadStr).toString('base64url')}.${signature}`;
}

/**
 * @returns {{ ok: true, state: object } | { ok: false, reason: 'tampered' | 'expired' }}
 */
function readAllowanceToken(token, nowMs) {
  if (!token || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'tampered' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'tampered' };

  let secret;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: 'tampered' };
  }

  let payloadStr;
  try {
    payloadStr = Buffer.from(parts[0], 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'tampered' };
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadStr);
  if (!signaturesMatch(parts[1], hmac.digest('base64url'))) return { ok: false, reason: 'tampered' };

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return { ok: false, reason: 'tampered' };
  }
  if (!payload || payload.typ !== ALLOWANCE_TYP) return { ok: false, reason: 'tampered' };

  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return { ok: false, reason: 'expired' };

  const accumulatedMs = Number(payload.acc);
  const lastTickAt = Number(payload.tick);
  const page = Number(payload.pg);
  return {
    ok: true,
    state: {
      accumulatedMs: Number.isFinite(accumulatedMs) && accumulatedMs > 0 ? Math.floor(accumulatedMs) : 0,
      exhausted: payload.ex === 1,
      lastTickAt: Number.isFinite(lastTickAt) ? lastTickAt : now,
      chapterId: normalizeChapterId(payload.ch),
      page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
      visitorId: normalizeVisitorId(payload.vid),
      exp,
    },
  };
}

function applyReadingTick(state, input) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const limit = Number.isFinite(input.limitMs) ? input.limitMs : currentLimitMs();
  const next = {
    accumulatedMs: state.accumulatedMs,
    exhausted: state.exhausted,
    lastTickAt: now,
    chapterId: input.chapterId || state.chapterId,
    page: input.page || state.page,
    visitorId: state.visitorId || input.visitorId || null,
    exp: state.exp,
  };

  if (input.decline === true) {
    next.exhausted = true;
    next.accumulatedMs = Math.max(next.accumulatedMs, limit);
    return next;
  }

  if (next.exhausted) return next;

  const elapsed = now - state.lastTickAt;
  let credit = 0;
  if (input.active === true && Number.isFinite(elapsed) && elapsed > 0) {
    credit = Math.min(elapsed, MAX_CREDIT_MS);
  }
  next.accumulatedMs = Math.min(limit, state.accumulatedMs + credit);
  if (next.accumulatedMs >= limit) next.exhausted = true;
  return next;
}

function publicAllowance(state, limitMs) {
  const limit = Number.isFinite(limitMs) ? limitMs : currentLimitMs();
  const accumulatedMs = Math.min(state.accumulatedMs, limit);
  const exhausted = state.exhausted || accumulatedMs >= limit;
  return {
    ok: true,
    accumulatedMs,
    remainingMs: exhausted ? 0 : Math.max(0, limit - accumulatedMs),
    exhausted,
    limitMs: limit,
    chapterId: state.chapterId,
    page: state.page,
  };
}

module.exports = {
  ALLOWANCE_TYP,
  LIMIT_MS,
  MAX_CREDIT_MS,
  SAMPLE_CHAPTER_IDS,
  allowanceLimitMs,
  currentLimitMs,
  freshAllowanceState,
  normalizeChapterId,
  normalizePage,
  normalizeVisitorId,
  signAllowanceState,
  readAllowanceToken,
  applyReadingTick,
  publicAllowance,
};
