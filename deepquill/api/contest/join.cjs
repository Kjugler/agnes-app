// deepquill/api/contest/join.cjs
// Endpoint to officially join the contest and award 500 points (idempotent)

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { hasContestJoin } = require('../../lib/contest/hasContestJoin.cjs');

/**
 * Resolve principal (userId) from request
 * Priority: userId from body > email from body > email from header
 */
async function resolvePrincipal(req) {
  const userId = req.body?.userId;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (user) {
      return { userId: user.id, email: user.email, method: 'body_userId' };
    }
  }

  const emailRaw = req.body?.email || req.headers['x-user-email'];
  if (emailRaw) {
    const normalizedEmail = normalizeEmail(emailRaw);
    if (normalizedEmail) {
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true },
      });
      if (user) {
        return { userId: user.id, email: user.email, method: 'email' };
      }
    }
  }

  return null;
}

/**
 * POST /api/contest/join
 * Awards 500 points for official contest entry (idempotent)
 * Returns: { joined: true, pointsAwarded: 500 | 0 }
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    ensureDatabaseUrl();

    // Resolve principal
    const principal = await resolvePrincipal(req);
    if (!principal) {
      return res.status(400).json({
        error: 'Missing required field: userId or email',
      });
    }

    const { userId, email } = principal;

    // B1: Check if user already joined using ledger-driven helper
    const alreadyJoined = await hasContestJoin(prisma, userId);
    
    if (alreadyJoined) {
      console.log('[contest/join] Already joined (idempotent)', {
        userId,
        email,
        note: 'Ledger-driven check - user has CONTEST_JOIN entry',
      });
      // A1: Get total from rollup (not user.points)
      const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
      let totalPoints = 0;
      try {
        const rollup = await getPointsRollupForUser(prisma, userId);
        totalPoints = rollup.totalPoints;
      } catch (rollupErr) {
        console.warn('[contest/join] Failed to get rollup for already-joined user', {
          error: rollupErr.message,
          userId,
        });
      }
      return res.json({
        joined: true,
        pointsAwarded: 0,
        reason: 'already_joined',
        userId,
        email,
        totalPoints, // A1: Use rollup total (canonical)
      });
    }

    // A2: Award 500 points - create ledger entry ONLY (no user.points increment)
    // B3: Use constant sessionId for idempotency
    const CONTEST_JOIN_SESSION_ID = 'contest_join';
    let pointsAwarded = 0;
    
    try {
      await prisma.$transaction(async (tx) => {
        // Create CONTEST_JOIN ledger entry (idempotent by unique constraint)
        // A2: Only create ledger entry - do NOT increment user.points
        await tx.ledger.create({
          data: {
            sessionId: CONTEST_JOIN_SESSION_ID,
            userId,
            type: 'CONTEST_JOIN',
            points: 500,
            amount: 500,
            currency: 'points',
            note: 'Official contest entry',
            meta: {
              entryMethod: 'form_submit',
              entryAt: new Date().toISOString(),
            },
          },
        });
        pointsAwarded = 500;
      });
    } catch (err) {
      // Handle unique constraint violation (race condition - another request created it)
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        console.log('[contest/join] Race condition - entry already exists', {
          userId,
          email,
        });
        return res.json({
          joined: true,
          pointsAwarded: 0,
          reason: 'already_joined_race',
          userId,
          email,
        });
      }
      throw err;
    }

    // A1: Get total from rollup (canonical source)
    const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
    let totalPoints = 0;
    try {
      const rollup = await getPointsRollupForUser(prisma, userId);
      totalPoints = rollup.totalPoints;
    } catch (rollupErr) {
      console.warn('[contest/join] Failed to get rollup after join', {
        error: rollupErr.message,
        userId,
      });
    }

    console.log('[contest/join] Points awarded', {
      userId,
      email,
      pointsAwarded,
      totalPoints, // A1: From rollup (canonical)
    });

    return res.json({
      joined: true,
      pointsAwarded,
      reason: 'awarded',
      userId,
      email,
      totalPoints, // A1: From rollup (canonical)
    });
  } catch (err) {
    // Get principal for error logging (may not be set if error occurred early)
    let principalForError = null;
    try {
      principalForError = await resolvePrincipal(req);
    } catch (resolveErr) {
      // Ignore resolve errors in error handler
    }

    console.error('[contest/join] Error', {
      error: err.message,
      stack: err.stack,
      userId: principalForError?.userId,
    });

    // Handle unique constraint violation (race condition - another request created it)
    if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
      console.log('[contest/join] Unique constraint violation (race condition)', {
        userId: principalForError?.userId,
        note: 'Another request created the entry - checking if joined',
      });
      // Check if entry exists (race condition)
      if (principalForError?.userId) {
        try {
          const alreadyJoined = await hasContestJoin(prisma, principalForError.userId);
          if (alreadyJoined) {
            const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
            let totalPoints = 0;
            try {
              const rollup = await getPointsRollupForUser(prisma, principalForError.userId);
              totalPoints = rollup.totalPoints;
            } catch (rollupErr) {
              // Ignore rollup errors
            }
            return res.json({
              joined: true,
              pointsAwarded: 0,
              reason: 'already_joined_race',
              userId: principalForError.userId,
              email: principalForError.email,
              totalPoints,
            });
          }
        } catch (checkErr) {
          // Ignore check errors
        }
      }
    }

    return res.status(500).json({
      error: err.message || 'Failed to join contest',
    });
  }
};
