// deepquill/api/contest/explicitEnter.cjs
// Endpoint for explicit contest entry via score page (+500 pts, idempotent)

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { hasContestJoin } = require('../../lib/contest/hasContestJoin.cjs');

/**
 * Resolve principal (userId) from request
 * Priority: userId cookie > email cookie > email header
 */
async function resolvePrincipal(req) {
  const cookieHeader = req.headers.cookie || '';
  const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
  const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
  
  const headerEmail = req.headers['x-user-email'];
  const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
  const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
  const cookieEmail = contestEmailMatch?.[1] || userEmailMatch?.[1];
  
  let userId = userIdCookie;
  let email = null;
  
  // Resolve by userId cookie (canonical)
  if (userIdCookie) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userIdCookie },
        select: { id: true, email: true },
      });
      if (user) {
        userId = user.id;
        email = user.email;
        return { userId, email, method: 'cookie_userId' };
      }
    } catch (err) {
      console.error('[explicitEnter] Error looking up user by userId cookie', { userIdCookie, error: err });
    }
  }
  
  // Fallback: Resolve by email
  const emailRaw = headerEmail || (cookieEmail ? decodeURIComponent(cookieEmail) : null);
  if (emailRaw) {
    const normalizedEmail = normalizeEmail(emailRaw);
    if (normalizedEmail) {
      try {
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true },
        });
        if (user) {
          return { userId: user.id, email: user.email, method: 'email' };
        }
      } catch (err) {
        console.error('[explicitEnter] Error looking up user by email', { email: normalizedEmail, error: err });
      }
    }
  }
  
  return null;
}

/**
 * Check if user has explicit entry (CONTEST_EXPLICIT_ENTRY ledger entry)
 */
async function hasExplicitEntry(prismaClient, userId) {
  if (!prismaClient || !userId) {
    return false;
  }
  
  try {
    const explicitEntry = await prismaClient.ledger.findFirst({
      where: {
        userId,
        type: 'CONTEST_EXPLICIT_ENTRY',
        currency: 'points',
        points: { gt: 0 },
      },
      select: { id: true },
    });
    
    return Boolean(explicitEntry);
  } catch (error) {
    console.error('[explicitEnter] Error checking explicit entry', {
      error: error.message,
      userId,
    });
    return false;
  }
}

/**
 * POST /api/contest/explicit-enter
 * Awards 500 points for explicit contest entry (idempotent)
 * Requires: user must be in contest (implicit join via CONTEST_JOIN)
 * Returns: { ok: true, alreadyEntered: boolean, pointsAwarded: 500 | 0, newTotalPoints: number }
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
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Missing userId cookie or email',
      });
    }

    const { userId, email } = principal;

    // Ensure user is in contest (implicit join required)
    const inContest = await hasContestJoin(prisma, userId);
    if (!inContest) {
      return res.status(400).json({
        error: 'not_in_contest',
        message: 'User must be in contest (implicit entry) before explicit entry',
      });
    }

    // Check if already explicitly entered
    const alreadyEntered = await hasExplicitEntry(prisma, userId);
    
    if (alreadyEntered) {
      console.log('[CONTEST_EXPLICIT_ENTRY] Already exists', {
        userId,
        email,
      });
      
      // Get total from rollup
      const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
      let totalPoints = 0;
      try {
        const rollup = await getPointsRollupForUser(prisma, userId);
        totalPoints = rollup.totalPoints;
      } catch (rollupErr) {
        console.warn('[explicitEnter] Failed to get rollup for already-entered user', {
          error: rollupErr.message,
          userId,
        });
      }
      
      return res.json({
        ok: true,
        alreadyEntered: true,
        pointsAwarded: 0,
        newTotalPoints: totalPoints,
        userId,
        email,
      });
    }

    // Award 500 points - create ledger entry
    const CONTEST_EXPLICIT_ENTRY_SESSION_ID = 'contest_explicit_entry';
    let pointsAwarded = 0;
    
    try {
      await prisma.$transaction(async (tx) => {
        // Create CONTEST_EXPLICIT_ENTRY ledger entry (idempotent by unique constraint)
        await tx.ledger.create({
          data: {
            sessionId: CONTEST_EXPLICIT_ENTRY_SESSION_ID,
            userId,
            type: 'CONTEST_EXPLICIT_ENTRY',
            points: 500,
            amount: 500,
            currency: 'points',
            note: 'Explicit contest entry via score page',
            meta: {
              entryMethod: 'explicit_score_page',
              entryAt: new Date().toISOString(),
            },
          },
        });
        pointsAwarded = 500;
      });
    } catch (err) {
      // Handle unique constraint violation (race condition)
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        console.log('[CONTEST_EXPLICIT_ENTRY] Race condition - entry already exists', {
          userId,
          email,
        });
        
        // Check if entry exists now
        const nowEntered = await hasExplicitEntry(prisma, userId);
        const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
        let totalPoints = 0;
        try {
          const rollup = await getPointsRollupForUser(prisma, userId);
          totalPoints = rollup.totalPoints;
        } catch (rollupErr) {
          // Ignore rollup errors
        }
        
        return res.json({
          ok: true,
          alreadyEntered: nowEntered,
          pointsAwarded: 0,
          newTotalPoints: totalPoints,
          userId,
          email,
        });
      }
      throw err;
    }

    // Get total from rollup (canonical source)
    const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
    let totalPoints = 0;
    try {
      const rollup = await getPointsRollupForUser(prisma, userId);
      totalPoints = rollup.totalPoints;
    } catch (rollupErr) {
      console.warn('[explicitEnter] Failed to get rollup after entry', {
        error: rollupErr.message,
        userId,
      });
    }

    // Reconcile user.points to match ledger
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { points: totalPoints },
      });
    } catch (reconcileErr) {
      console.warn('[explicitEnter] Failed to reconcile user.points', {
        error: reconcileErr.message,
        userId,
      });
    }

    console.log('[CONTEST_EXPLICIT_ENTRY] Created', {
      userId,
      email,
      pointsAwarded,
      totalPoints,
    });

    return res.json({
      ok: true,
      alreadyEntered: false,
      pointsAwarded,
      newTotalPoints: totalPoints,
      userId,
      email,
    });
  } catch (err) {
    let principalForError = null;
    try {
      principalForError = await resolvePrincipal(req);
    } catch (resolveErr) {
      // Ignore resolve errors in error handler
    }

    console.error('[CONTEST_EXPLICIT_ENTRY] Error', {
      error: err.message,
      stack: err.stack,
      userId: principalForError?.userId,
    });

    return res.status(500).json({
      error: err.message || 'Failed to process explicit entry',
    });
  }
};
