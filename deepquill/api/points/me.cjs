// deepquill/api/points/me.cjs
// Get user points - canonical DB owner

const { prisma } = require('../../server/prisma.cjs');
const { LedgerType } = require('@prisma/client');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { getPointsRollupForUser } = require('../../lib/pointsRollup.cjs');
const { recordLedgerEntry } = require('../../lib/ledger/recordLedger.cjs');
const { hasContestJoin } = require('../../lib/contest/hasContestJoin.cjs');

async function handlePointsMe(req, res) {
  try {
    ensureDatabaseUrl();
    
    // [PRINCIPAL] Resolve canonical principal identity
    const cookieHeader = req.headers.cookie || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    
    const headerEmail = req.headers['x-user-email'];
    const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
    const cookieEmail = contestEmailMatch?.[1] || userEmailMatch?.[1];
    
    let userId = userIdCookie;
    let email = null;
    let principalResolutionMethod = 'none';
    
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
          principalResolutionMethod = 'cookie_userId';
          console.log('[PRINCIPAL] Principal resolved by userId cookie', { userId, email });
        } else {
          console.warn('[PRINCIPAL] MISMATCH - userId cookie provided but User not found', { userIdCookie });
        }
      } catch (err) {
        console.error('[PRINCIPAL] Error looking up user by userId cookie', { userIdCookie, error: err });
      }
    }
    
    // Fallback: Resolve by email
    if (!userId || !email) {
      const emailRaw = headerEmail || (cookieEmail ? decodeURIComponent(cookieEmail) : null);
      if (emailRaw) {
        email = normalizeEmail(emailRaw);
        if (email) {
          principalResolutionMethod = userIdCookie ? 'email_fallback' : 'email';
          console.log('[PRINCIPAL] Principal resolved by email', { 
            email, 
            method: principalResolutionMethod,
            hadUserIdCookie: !!userIdCookie,
          });
        }
      }
    }
    
    if (!email && !userId) {
      console.warn('[PRINCIPAL] Principal NOT resolved - no userId or email available');
      return res.status(400).json({ error: 'missing_user_identity' });
    }

    // Ensure User exists (if we only have email)
    if (email && !userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (user) {
          userId = user.id;
          console.log('[PRINCIPAL] User found from email', { userId, email });
        }
      } catch (err) {
        console.error('[PRINCIPAL] Failed to find user from email', { email, error: err });
        return res.status(500).json({ error: 'user_resolution_failed' });
      }
    }

    // [PRINCIPAL] Log final resolution
    console.log('[PRINCIPAL] Principal resolved for points/me', {
      userId: userId || 'MISSING',
      email: email || 'MISSING',
      method: principalResolutionMethod,
    });

    if (!userId) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        ledger: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    console.log('[points/me] User lookup', { 
      userIdSearched: userId,
      emailSearched: email, 
      found: !!user,
      userId: user?.id,
      points: user?.points,
      principalMethod: principalResolutionMethod,
    });

    if (!user) {
      console.log('[points/me] User not found after ensure, returning zeros');
      return res.json({
        total: 0,
        firstName: null,
        earned: { purchase_book: false, share_x: false, share_ig: false },
        dailyShares: {
          facebookEarnedToday: false,
          xEarnedToday: false,
          instagramEarnedToday: false,
        },
        rabbit1Completed: false,
        lastEvent: null,
        referrals: {
          friends_purchased_count: 0,
          earnings_week_usd: 0,
        },
        recent: [],
      });
    }

    // Get referral conversions for the current week (Monday-Sunday)
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday = 0
    startOfWeek.setHours(0, 0, 0, 0);

    const referralConversionsRaw = await prisma.$queryRaw`
      SELECT commissionCents
      FROM ReferralConversion
      WHERE referrerUserId = ${user.id}
        AND createdAt >= ${startOfWeek}
    `;

    const earningsWeekCents = referralConversionsRaw.reduce((sum, conv) => {
      return sum + (conv.commissionCents || 0);
    }, 0);
    const earningsWeekUsd = earningsWeekCents / 100;

    const friendsPurchasedCountResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM ReferralConversion
      WHERE referrerUserId = ${user.id}
    `;
    const friendsPurchasedCount = Number(friendsPurchasedCountResult[0]?.count || 0);

    // A1: Use centralized points rollup (single source of truth)
    let rollup;
    try {
      rollup = await getPointsRollupForUser(prisma, user.id);
    } catch (err) {
      console.error('[points/me] Error calculating points rollup', {
        error: err?.message,
        userId: user.id,
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

    // ✅ 2) Auto-heal: reconcile user.points with ledger rollup
    let reconciliationApplied = false;
    let legacyPointsMigrated = false;
    let calculatedTotalPoints = rollup.totalPoints;
    
    if (calculatedTotalPoints !== user.points) {
      const delta = user.points - calculatedTotalPoints;
      console.warn('[points/me] Points mismatch detected', {
        userId: user.id,
        userPoints: user.points,
        calculatedFromLedger: calculatedTotalPoints,
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
              userId: user.id,
              type: 'MANUAL_ADJUST',
              note: { contains: 'LEGACY_POINTS_IMPORT' },
            },
          });
          
          if (!existingLegacy) {
            await recordLedgerEntry(prisma, {
              sessionId: null,
              userId: user.id,
              type: 'MANUAL_ADJUST',
              points: delta,
              currency: 'points',
              note: `LEGACY_POINTS_IMPORT: migrated ${delta} points from user.points to ledger`,
              meta: {
                source: 'user.points',
                reason: 'ledger_canonical_migration',
                originalUserPoints: user.points,
                calculatedFromLedger: calculatedTotalPoints,
                delta,
              },
            });
            
            legacyPointsMigrated = true;
            console.log('[points/me] Legacy points migrated to ledger', {
              userId: user.id,
              delta,
            });
            
            // Recalculate rollup with new legacy entry
            const updatedRollup = await getPointsRollupForUser(prisma, user.id);
            rollup.totalPoints = updatedRollup.totalPoints;
            rollup.basePoints = updatedRollup.basePoints;
            rollup.purchasePoints = updatedRollup.purchasePoints;
            rollup.referralPoints = updatedRollup.referralPoints;
          }
        } catch (err) {
          console.error('[points/me] Failed to migrate legacy points', {
            error: err?.message,
            userId: user.id,
            delta,
          });
        }
      }
      
      // ✅ B) Update user.points to match ledger (cache field)
      // Use the final rollup.totalPoints (may have been updated by legacy migration)
      const finalTotalPoints = rollup.totalPoints;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { points: finalTotalPoints },
        });
        reconciliationApplied = true;
        console.log('[points/me] Reconciled user.points to match ledger', {
          userId: user.id,
          oldPoints: user.points,
          newPoints: finalTotalPoints,
        });
      } catch (err) {
        console.error('[points/me] Failed to reconcile user.points', {
          error: err?.message,
          userId: user.id,
        });
      }
      
      // Update calculatedTotalPoints after potential legacy migration
      calculatedTotalPoints = rollup.totalPoints;
    }
    
    // Format recent ledger entries
    const recent = user.ledger.map((entry) => ({
      ts: entry.createdAt.toISOString(),
      label: entry.note || `${entry.type} - ${entry.points > 0 ? `+${entry.points} pts` : ''} ${Number(entry.usd) > 0 ? `+$${Number(entry.usd).toFixed(2)}` : ''}`,
      deltaPts: entry.points,
      deltaUsd: Number(entry.usd),
    }));

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const createdNow = user.createdAt > oneHourAgo;

    // Get most recent ledger entry
    const mostRecentLedger = user.ledger.length > 0 ? user.ledger[0] : null;
    let lastEvent = null;

    if (mostRecentLedger) {
      let eventType = null;
      let referrerName = null;

      if (mostRecentLedger.type === 'PURCHASE_BOOK' || mostRecentLedger.type === 'PURCHASE_RECORDED') {
        eventType = 'purchase_book';
      } else if (mostRecentLedger.type === 'SHARE_FB') {
        eventType = 'share_fb';
      } else if (mostRecentLedger.type === 'SHARE_X') {
        eventType = 'share_x';
      } else if (mostRecentLedger.type === 'SHARE_IG') {
        eventType = 'share_ig';
      } else if (mostRecentLedger.type === 'REFER_FRIEND_PAYOUT') {
        eventType = 'invite_friend';
      } else if (mostRecentLedger.type === 'REFER_EMAIL') {
        eventType = 'invite_friend';
      }

      if (eventType) {
        lastEvent = {
          type: eventType,
          referrerName: referrerName || null,
        };
      }
    }

    // Check contest join status (implicit entry)
    let contestJoined = false;
    try {
      contestJoined = await hasContestJoin(prisma, user.id);
    } catch (contestJoinErr) {
      console.warn('[points/me] Failed to check contest join', {
        error: contestJoinErr.message,
        userId: user.id,
      });
    }

    // Check explicit entry status
    let explicitContestEntry = false;
    try {
      const explicitEntryLedger = await prisma.ledger.findFirst({
        where: {
          userId: user.id,
          type: LedgerType.CONTEST_EXPLICIT_ENTRY,
          currency: 'points',
          points: { gt: 0 },
        },
        select: { id: true },
      });
      explicitContestEntry = Boolean(explicitEntryLedger);
    } catch (explicitErr) {
      console.warn('[points/me] Failed to check explicit entry', {
        error: explicitErr.message,
        userId: user.id,
      });
    }

    console.log('[points/me] Returning data', {
      total: calculatedTotalPoints,
      userPoints: user.points,
      calculatedFromLedger: calculatedTotalPoints,
      firstName: user.firstName || user.fname,
      earnedPurchaseBook: user.earnedPurchaseBook,
      rabbit1Completed: user.rabbit1Completed,
      createdNow,
      lastEvent,
      contestJoined,
      explicitContestEntry,
    });

    return res.json({
      total: calculatedTotalPoints, // A1: Use calculated total from ledger (canonical source) - UI MUST use this
      userPoints: user.points, // DEBUG ONLY: user.points may drift - DO NOT USE IN UI
      firstName: user.firstName || user.fname || null,
      createdNow,
      earned: {
        purchase_book: user.earnedPurchaseBook,
        share_x: false,
        share_ig: false,
      },
      dailyShares: {
        facebookEarnedToday: false, // TODO: implement
        xEarnedToday: false, // TODO: implement
        instagramEarnedToday: false, // TODO: implement
      },
      rabbit1Completed: user.rabbit1Completed,
      lastEvent,
      referrals: {
        friends_purchased_count: friendsPurchasedCount,
        earnings_week_usd: earningsWeekUsd,
      },
      recent,
      contestJoined, // Implicit entry (via purchase or CONTEST_JOIN)
      explicitContestEntry, // Explicit entry (via score page)
    });
  } catch (err) {
    console.error('[points/me] error', err);
    return res.status(500).json({ error: 'Failed to fetch points' });
  }
}

module.exports = handlePointsMe;
