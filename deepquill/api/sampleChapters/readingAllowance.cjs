// GET/POST /api/sample-chapters/reading-allowance
// Header: x-reading-allowance (signed token). Missing token starts a new allowance.
// A tampered token does not start over. Client duration fields are ignored.

const {
  allowanceLimitMs,
  applyReadingTick,
  freshAllowanceState,
  normalizeChapterId,
  normalizePage,
  normalizeVisitorId,
  publicAllowance,
  readAllowanceToken,
  signAllowanceState,
  currentLimitMs,
} = require('../../src/lib/readingAllowance.cjs');

function tokenFromRequest(req) {
  const header = req.headers['x-reading-allowance'];
  return typeof header === 'string' ? header.trim() : '';
}

function respond(res, state, limit) {
  const body = publicAllowance(state, limit);
  body.allowanceToken = signAllowanceState(state);
  return res.json(body);
}

module.exports = async function readingAllowanceHandler(req, res) {
  try {
    const now = Date.now();
    const limit = currentLimitMs();
    const raw = tokenFromRequest(req);
    let state;

    if (!raw) {
      state = freshAllowanceState(now);
    } else {
      const read = readAllowanceToken(raw, now);
      if (!read.ok && read.reason === 'tampered') {
        return res.status(403).json({ ok: false, error: 'invalid_allowance' });
      }
      if (!read.ok && read.reason === 'expired') {
        state = freshAllowanceState(now);
      } else if (read.ok) {
        state = read.state;
      } else {
        return res.status(403).json({ ok: false, error: 'invalid_allowance' });
      }
    }

    if (req.method === 'GET') {
      return respond(res, state, limit);
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const chapterId = normalizeChapterId(body.chapterId) || state.chapterId;
    const page = normalizePage(body.page) || state.page;
    const visitorId = normalizeVisitorId(body.visitorId);
    state = applyReadingTick(state, {
      now,
      limitMs: limit,
      active: body.active === true,
      decline: body.decline === true,
      chapterId,
      page,
      visitorId,
    });
    return respond(res, state, limit);
  } catch (err) {
    console.error('[reading-allowance]', err && err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

module.exports.allowanceLimitMs = allowanceLimitMs;
