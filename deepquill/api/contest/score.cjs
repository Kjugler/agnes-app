// deepquill/api/contest/score.cjs
// Get player score - canonical DB owner
// ✅ Prioritizes logged-in principal over session_id

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');

async function handleContestScore(req, res) {
  try {
    ensureDatabaseUrl();
    
    // ✅ Step 1: Resolve principal (logged-in user)
    const cookieHeader = req.headers.cookie || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    
    const headerEmail = req.headers['x-user-email'];
    const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
    const cookieEmail = contestEmailMatch?.[1] || userEmailMatch?.[1];
    
    let principalUserId = userIdCookie;
    let principalEmail = null;
    let principalResolutionMethod = 'none';
    
    // Resolve by userId cookie (canonical)
    if (userIdCookie) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userIdCookie },
          select: { id: true, email: true },
        });
        if (user) {
          principalUserId = user.id;
          principalEmail = user.email;
          principalResolutionMethod = 'cookie_userId';
          console.log('[PRINCIPAL] Principal resolved by userId cookie', { userId: principalUserId, email: principalEmail });
        } else {
          console.warn('[PRINCIPAL] MISMATCH - userId cookie provided but User not found', { userIdCookie });
        }
      } catch (err) {
        console.error('[PRINCIPAL] Error looking up user by userId cookie', { userIdCookie, error: err });
      }
    }
    
    // Fallback: Resolve by email
    if (!principalUserId || !principalEmail) {
      const emailRaw = headerEmail || (cookieEmail ? decodeURIComponent(cookieEmail) : null);
      if (emailRaw) {
        principalEmail = normalizeEmail(emailRaw);
        if (principalEmail) {
          principalResolutionMethod = userIdCookie ? 'email_fallback' : 'email';
          console.log('[PRINCIPAL] Principal resolved by email', { 
            email: principalEmail, 
            method: principalResolutionMethod,
            hadUserIdCookie: !!userIdCookie,
          });
        }
      }
    }
    
    // Ensure User exists if we only have email
    if (principalEmail && !principalUserId) {
      try {
        const user = await prisma.user.findUnique({
          where: { email: principalEmail },
          select: { id: true },
        });
        if (user) {
          principalUserId = user.id;
          console.log('[PRINCIPAL] User found from email', { userId: principalUserId, email: principalEmail });
        }
      } catch (err) {
        console.error('[PRINCIPAL] Failed to find user from email', { email: principalEmail, error: err });
      }
    }
    
    // ✅ Step 2: Read session_id and force_session params
    let sessionId = req.query?.session_id || req.query?.sessionId;
    const forceSession = req.query?.force_session === '1';
    
    // Fallback: parse from URL if query not populated
    if (!sessionId && req.url) {
      try {
        const protocol = req.protocol || 'http';
        const host = req.get('host') || req.headers.host || 'localhost:5055';
        const url = new URL(req.originalUrl || req.url, `${protocol}://${host}`);
        sessionId = url.searchParams.get('session_id') || url.searchParams.get('sessionId');
      } catch (urlErr) {
        const match1 = req.url.match(/[?&]session_id=([^&]+)/);
        const match2 = req.url.match(/[?&]sessionId=([^&]+)/);
        if (match1) {
          sessionId = decodeURIComponent(match1[1]);
        } else if (match2) {
          sessionId = decodeURIComponent(match2[1]);
        }
      }
    }
    
    // ✅ Step 3: Determine effective userId (explicit precedence rules)
    let effectiveUserId = null;
    let effectiveReason = 'none';
    
    // ✅ A) If force_session=1: require session_id and use it (even if principal exists)
    if (forceSession) {
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        console.error('[contest/score] force_session=1 requires session_id', {
          principalUserId: principalUserId || 'none',
          sessionId: sessionId || 'none',
        });
        return res.status(400).json({
          error: 'force_session=1 requires session_id parameter',
          received: {
            originalUrl: req.originalUrl || req.url,
            queryKeys: Object.keys(req.query || {}),
            hasPrincipal: !!principalUserId,
            hasSessionId: !!sessionId,
          },
        });
      }
      
      // Resolve session_id → userId (via purchase/checkout mapping)
      const trimmedSessionId = sessionId.trim();
      console.log('[contest/score] force_session=1: resolving session_id', trimmedSessionId);
      
      try {
        const purchase = await prisma.purchase.findUnique({
          where: { sessionId: trimmedSessionId },
          include: {
            user: {
              select: { id: true, email: true },
            },
          },
        });
        
        if (purchase?.userId) {
          effectiveUserId = purchase.userId;
          effectiveReason = 'force_session';
          console.log('[contest/score] force_session: Found userId from session', {
            sessionId: trimmedSessionId,
            userId: effectiveUserId,
            reason: 'force_session_lookup',
          });
        } else if (purchase?.user?.email) {
          // Fallback: lookup by email from purchase
          const userByEmail = await prisma.user.findUnique({
            where: { email: purchase.user.email },
            select: { id: true },
          });
          if (userByEmail) {
            effectiveUserId = userByEmail.id;
            effectiveReason = 'force_session_email';
            console.log('[contest/score] force_session: Found userId from session email', {
              sessionId: trimmedSessionId,
              email: purchase.user.email,
              userId: effectiveUserId,
            });
          }
        }
        
        // ✅ If mapping fails, return clear error (not 0)
        if (!effectiveUserId) {
          console.error('[contest/score] force_session: session_id not recognized', {
            sessionId: trimmedSessionId,
            principalUserId: principalUserId || 'none',
          });
          return res.status(404).json({
            error: 'session_id not recognized',
            message: `No purchase found for session_id: ${trimmedSessionId}. Use a valid checkout session ID.`,
            sessionId: trimmedSessionId,
            received: {
              originalUrl: req.originalUrl || req.url,
              hasPrincipal: !!principalUserId,
            },
          });
        }
      } catch (err) {
        console.error('[contest/score] force_session: Error looking up session', {
          error: err?.message,
          sessionId: trimmedSessionId,
        });
        return res.status(500).json({
          error: 'Failed to resolve session_id',
          message: err?.message || 'Unknown error',
          sessionId: trimmedSessionId,
        });
      }
    } else if (principalUserId) {
      // ✅ B) Normal behavior: principal wins (no force_session)
      effectiveUserId = principalUserId;
      effectiveReason = 'principal';
      console.log('[contest/score] Using principal userId', {
        principalUserId,
        principalEmail,
        principalResolutionMethod,
        sessionId: sessionId || 'none',
        reason: 'principal_priority',
      });
    } else if (sessionId && typeof sessionId === 'string' && sessionId.trim().length > 0) {
      // ✅ C) Recovery path: no principal, use session_id
      const trimmedSessionId = sessionId.trim();
      console.log('[contest/score] Recovery: Looking up userId from session_id', trimmedSessionId);
      
      try {
        const purchase = await prisma.purchase.findUnique({
          where: { sessionId: trimmedSessionId },
          include: {
            user: {
              select: { id: true, email: true },
            },
          },
        });
        
        if (purchase?.userId) {
          effectiveUserId = purchase.userId;
          effectiveReason = 'session_recovery';
          console.log('[contest/score] Recovery: Found userId from session', {
            sessionId: trimmedSessionId,
            userId: effectiveUserId,
          });
        } else if (purchase?.user?.email) {
          // Fallback: lookup by email from purchase
          const userByEmail = await prisma.user.findUnique({
            where: { email: purchase.user.email },
            select: { id: true },
          });
          if (userByEmail) {
            effectiveUserId = userByEmail.id;
            effectiveReason = 'session_recovery_email';
            console.log('[contest/score] Recovery: Found userId from session email', {
              sessionId: trimmedSessionId,
              email: purchase.user.email,
              userId: effectiveUserId,
            });
          }
        }
        
        // ✅ If recovery fails, return clear error
        if (!effectiveUserId) {
          console.error('[contest/score] Recovery: session_id not recognized', {
            sessionId: trimmedSessionId,
          });
          return res.status(404).json({
            error: 'session_id not recognized',
            message: `No purchase found for session_id: ${trimmedSessionId}. The webhook may still be processing, or the session ID is invalid.`,
            sessionId: trimmedSessionId,
          });
        }
      } catch (err) {
        console.error('[contest/score] Recovery: Error looking up session', {
          error: err?.message,
          sessionId: trimmedSessionId,
        });
        return res.status(500).json({
          error: 'Failed to resolve session_id',
          message: err?.message || 'Unknown error',
          sessionId: trimmedSessionId,
        });
      }
    }
    
    // ✅ Step 4: Validate we have a userId
    if (!effectiveUserId) {
      const errorMsg = principalUserId 
        ? 'session_id query parameter is required (use force_session=1 to override principal)'
        : 'session_id query parameter is required (no principal found)';
      
      console.error('[contest/score] No effective userId', {
        principalUserId: principalUserId || 'none',
        sessionId: sessionId || 'none',
        forceSession,
        reason: effectiveReason,
      });
      
      return res.status(400).json({
        error: errorMsg,
        received: {
          originalUrl: req.originalUrl || req.url,
          queryKeys: Object.keys(req.query || {}),
          hasPrincipal: !!principalUserId,
          hasSessionId: !!sessionId,
        },
      });
    }
    
    // ✅ Step 5: Log identity resolution
    console.log('[contest/score] Identity resolution', {
      principalUserId: principalUserId || 'none',
      principalEmail: principalEmail || 'none',
      principalResolutionMethod,
      sessionId: sessionId || 'none',
      forceSession,
      effectiveUserId,
      effectiveReason,
    });

    // ✅ Step 6: Get User for effectiveUserId
    const player = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select: { id: true, points: true },
    });

    if (!player) {
      console.error('[contest/score] User not found for effectiveUserId', { effectiveUserId });
      return res.status(404).json({
        error: 'User not found',
        effectiveUserId,
        effectiveReason,
      });
    }

    // A1: Use centralized points rollup (single source of truth)
    let rollup;
    try {
      rollup = await getPointsRollupForUser(prisma, player.id);
    } catch (err) {
      console.error('[contest/score] Error calculating points rollup', {
        error: err?.message,
        playerId: player.id,
      });
      // Fallback to zeros if rollup fails
      rollup = {
        totalPoints: 0,
        purchasePoints: 0,
        referralPoints: 0,
        basePoints: 0,
        breakdownByType: {},
      };
    }

    const { totalPoints, purchasePoints, referralPoints, basePoints } = rollup;

    // ✅ 2) Auto-heal: reconcile user.points with ledger rollup
    let reconciliationApplied = false;
    let legacyPointsMigrated = false;
    
    if (totalPoints !== player.points) {
      const delta = player.points - totalPoints;
      console.warn('[contest/score] Points mismatch detected', {
        userId: player.id,
        userPoints: player.points,
        calculatedFromLedger: totalPoints,
        delta,
        note: 'Reconciling...',
      });
      
      // ✅ C) Preserve legacy points: if user.points > ledger, migrate to ledger
      if (delta > 0 && delta <= 1000) {
        // Small positive delta (likely legacy points) - migrate to ledger
        try {
          // Check if legacy migration already exists
          const existingLegacy = await prisma.ledger.findFirst({
            where: {
              userId: player.id,
              type: 'MANUAL_ADJUST',
              note: { contains: 'LEGACY_POINTS_IMPORT' },
            },
          });
          
          if (!existingLegacy) {
            await recordLedgerEntry(prisma, {
              sessionId: null,
              userId: player.id,
              type: 'MANUAL_ADJUST',
              points: delta,
              currency: 'points',
              note: `LEGACY_POINTS_IMPORT: migrated ${delta} points from user.points to ledger`,
              meta: {
                source: 'user.points',
                reason: 'ledger_canonical_migration',
                originalUserPoints: player.points,
                calculatedFromLedger: totalPoints,
                delta,
              },
            });
            
            legacyPointsMigrated = true;
            console.log('[contest/score] Legacy points migrated to ledger', {
              userId: player.id,
              delta,
            });
            
            // Recalculate rollup with new legacy entry
            const updatedRollup = await getPointsRollupForUser(prisma, player.id);
            rollup.totalPoints = updatedRollup.totalPoints;
            rollup.basePoints = updatedRollup.basePoints;
            rollup.purchasePoints = updatedRollup.purchasePoints;
            rollup.referralPoints = updatedRollup.referralPoints;
          }
        } catch (err) {
          console.error('[contest/score] Failed to migrate legacy points', {
            error: err?.message,
            userId: player.id,
            delta,
          });
        }
      }
      
      // ✅ B) Update user.points to match ledger (cache field)
      // Use the final rollup.totalPoints (may have been updated by legacy migration)
      const finalTotalPoints = rollup.totalPoints;
      try {
        await prisma.user.update({
          where: { id: player.id },
          data: { points: finalTotalPoints },
        });
        reconciliationApplied = true;
        console.log('[contest/score] Reconciled user.points to match ledger', {
          userId: player.id,
          oldPoints: player.points,
          newPoints: finalTotalPoints,
        });
      } catch (err) {
        console.error('[contest/score] Failed to reconcile user.points', {
          error: err?.message,
          userId: player.id,
        });
      }
    }

    // C1: Use rollup totalPoints (canonical source)
    const totalPointsFromLedger = rollup.totalPoints;
    
    console.log('[contest/score] Score found', {
      effectiveUserId,
      effectiveReason,
      totalPoints: totalPointsFromLedger,
      playerPoints: player.points,
      calculatedFromLedger: totalPointsFromLedger,
      purchasePoints,
      referralPoints,
      basePoints,
      reconciliationApplied,
      legacyPointsMigrated,
    });

    return res.json({
      totalPoints, // ✅ Canonical total from ledger rollup (single source of truth)
      basePoints,
      purchasePoints,
      referralPoints,
      // DEBUG ONLY: player.points may drift - DO NOT USE
      _debug_playerPoints: player.points,
      // ✅ Debug info: which identity was used
      _debug_identity: {
        effectiveUserId,
        effectiveReason,
        principalUserId: principalUserId || null,
        sessionId: sessionId || null,
      },
    });
  } catch (err) {
    console.error('[contest/score] Error fetching score', {
      error: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      error: 'Failed to fetch score',
      message: err?.message || 'Unknown error',
    });
  }
}

module.exports = handleContestScore;
