// deepquill/api/referral/award-email-points.cjs
// Award points for referral emails - canonical DB owner

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');

async function handleAwardReferralEmailPoints(req, res) {
  try {
    ensureDatabaseUrl();
    
    const { userId, friendEmails } = req.body;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'userId is required',
      });
    }

    if (!Array.isArray(friendEmails) || friendEmails.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'friendEmails array is required',
      });
    }

    // Points constants
    const MAX_EMAILS_PER_DAY = 20;
    const MAX_POINTS_PER_DAY = 100;
    const POINTS_PER_EMAIL = 5;

    // Check today's referral email activity
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayReferralEmails = await prisma.ledger.findMany({
      where: {
        userId,
        type: 'REFER_EMAIL',
        createdAt: { gte: todayStart },
      },
      select: { points: true },
    });

    const emailsSentToday = todayReferralEmails.length;
    const pointsFromEmailsToday = todayReferralEmails.reduce(
      (sum, entry) => sum + (entry.points || 0),
      0
    );

    // Calculate remaining capacity
    const remainingEmails = Math.max(0, MAX_EMAILS_PER_DAY - emailsSentToday);
    const remainingPoints = Math.max(0, MAX_POINTS_PER_DAY - pointsFromEmailsToday);

    const results = [];
    let currentEmailsSent = emailsSentToday;
    let currentPointsAwarded = pointsFromEmailsToday;

    // Process emails sequentially to correctly track caps
    for (const friendEmail of friendEmails) {
      // Check if we're still under caps
      const eligibleForPoints =
        currentEmailsSent < MAX_EMAILS_PER_DAY &&
        currentPointsAwarded < MAX_POINTS_PER_DAY;
      
      let pointsForThisEmail = 0;
      if (eligibleForPoints) {
        const pointsRemaining = MAX_POINTS_PER_DAY - currentPointsAwarded;
        pointsForThisEmail = Math.min(POINTS_PER_EMAIL, pointsRemaining);
      }

      // A3: Award points if eligible - create ledger entry ONLY (no user.points increment)
      // Idempotency: check if this email was already sent today to this recipient
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const normalizedFriendEmail = friendEmail.trim().toLowerCase();
      
      // Check if this specific email was already sent today (idempotency per recipient per day)
      const existingEmailToday = await prisma.ledger.findFirst({
        where: {
          userId,
          type: 'REFER_EMAIL',
          createdAt: { gte: todayStart },
          note: { contains: normalizedFriendEmail },
        },
        select: { id: true, points: true },
      });

      if (existingEmailToday) {
        // Already sent to this recipient today - skip (idempotent)
        console.log('[POINTS] Referral email already sent today (idempotent)', {
          userId,
          friendEmail: normalizedFriendEmail,
          existingPoints: existingEmailToday.points,
        });
        results.push({
          email: friendEmail,
          pointsAwarded: 0,
          sent: false,
          reason: 'already_sent_today',
        });
        currentEmailsSent += 1;
        continue;
      }

      if (pointsForThisEmail > 0) {
        // A2: Create ledger entry ONLY (no user.points increment)
        // A3: Ensure REFER_EMAIL creates ledger entry with proper currency and points
        try {
          const ledgerEntry = await prisma.ledger.create({
            data: {
              userId,
              type: 'REFER_EMAIL',
              points: pointsForThisEmail,
              currency: 'points', // A3: Explicit currency for rollup inclusion
              note: `Referral email sent to ${normalizedFriendEmail}`,
              meta: {
                recipientEmail: normalizedFriendEmail,
                sentAt: new Date().toISOString(),
              },
            },
          });
          currentPointsAwarded += pointsForThisEmail;
          console.log('[POINTS] Awarded', pointsForThisEmail, 'points for refer_email to', normalizedFriendEmail, {
            userId,
            ledgerEntryId: ledgerEntry.id,
            ledgerType: ledgerEntry.type,
            ledgerCurrency: ledgerEntry.currency,
            ledgerPoints: ledgerEntry.points,
            note: 'Ledger entry created (no user.points increment)',
          });
        } catch (ledgerErr) {
          console.error('[POINTS] Failed to create REFER_EMAIL ledger entry', {
            error: ledgerErr.message,
            userId,
            friendEmail: normalizedFriendEmail,
            pointsForThisEmail,
            stack: ledgerErr.stack,
          });
          // Don't fail the request - email was sent, just log the error
        }
      } else {
        // Still record in ledger for audit trail (0 points)
        await prisma.ledger.create({
          data: {
            userId,
            type: 'REFER_EMAIL',
            points: 0,
            currency: 'points',
            note: `Referral email sent to ${normalizedFriendEmail} (daily cap reached)`,
            meta: {
              recipientEmail: normalizedFriendEmail,
              sentAt: new Date().toISOString(),
              reason: 'daily_cap_reached',
            },
          },
        });
        console.log('[POINTS] Referral email sent but no points awarded (daily cap reached)', {
          userId,
          friendEmail: normalizedFriendEmail,
          emailsSentToday: currentEmailsSent,
          pointsFromEmailsToday: currentPointsAwarded,
        });
      }

      currentEmailsSent += 1;

      results.push({
        email: friendEmail,
        pointsAwarded: pointsForThisEmail,
        sent: true,
      });
    }

    const totalPointsAwarded = results.reduce((sum, r) => sum + r.pointsAwarded, 0);
    const finalEmailsSentToday = currentEmailsSent;
    const finalPointsFromEmailsToday = currentPointsAwarded;

    return res.json({
      ok: true,
      emailsSent: friendEmails.length,
      pointsAwarded: totalPointsAwarded,
      daily: {
        emailsSentToday: finalEmailsSentToday,
        pointsFromEmailsToday: finalPointsFromEmailsToday,
        maxEmailsPerDay: MAX_EMAILS_PER_DAY,
        maxPointsPerDay: MAX_POINTS_PER_DAY,
      },
      results,
    });
  } catch (err) {
    console.error('[referral/award-email-points] error', err);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: err.message,
    });
  }
}

module.exports = handleAwardReferralEmailPoints;
