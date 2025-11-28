// deepquill/api/send-daily-digests.cjs
const express = require('express');
const router = express.Router();
const { sendDailyReferralDigestEmail } = require('../lib/email/sendDailyReferralDigestEmail.cjs');

// Auth middleware: verify API token
function authApiToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.DEEPQUILL_API_TOKEN;

  if (!expectedToken) {
    console.error('[DAILY_DIGEST][AUTH] DEEPQUILL_API_TOKEN not configured');
    return res.status(500).json({ error: 'Server not configured' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (token !== expectedToken) {
    console.warn('[DAILY_DIGEST][AUTH] Invalid token attempt');
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

/**
 * Get yesterday's date in America/Denver timezone as ISO date string
 * Simplified approach: calculate date string and use UTC range that covers the day
 */
function getYesterdayInDenver() {
  const now = new Date();
  
  // Get current date in Denver timezone (YYYY-MM-DD format)
  const denverToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  
  // Parse and subtract one day
  const [year, month, day] = denverToday.split('-').map(Number);
  const yesterday = new Date(year, month - 1, day - 1);
  
  // Format as YYYY-MM-DD
  const isoDate = yesterday.toISOString().split('T')[0];
  
  // Denver is UTC-7 (MST) or UTC-6 (MDT)
  // To be safe, we'll use UTC-8 to UTC-5 range to cover the entire day
  // Start: midnight Denver = 07:00 UTC (MST) or 06:00 UTC (MDT) - use 05:00 UTC to be safe
  // End: 23:59:59 Denver = 06:59:59 UTC (MST) or 05:59:59 UTC (MDT) - use 07:59:59 UTC next day
  const [y, m, d] = isoDate.split('-').map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d, 5, 0, 0)); // 5 AM UTC = ~11 PM previous day Denver
  const dayEnd = new Date(Date.UTC(y, m - 1, d + 1, 7, 59, 59)); // 7:59 AM UTC next day = ~1 AM next day Denver
  
  return {
    digestDate: isoDate,
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
  };
}

router.post('/send-daily-digests', authApiToken, async (req, res) => {
  try {
    console.log('[DAILY_DIGEST] Starting daily digest job');

    // Get Prisma client (same as award-referral-commission.cjs)
    let prisma = null;
    try {
      const { PrismaClient } = require('@prisma/client');
      prisma = new PrismaClient();
    } catch (err) {
      console.error('[DAILY_DIGEST] Prisma not available:', err.message);
      return res.status(500).json({ error: 'Database client not available' });
    }

    // Determine date window (yesterday in America/Denver)
    const { digestDate, dayStart, dayEnd } = getYesterdayInDenver();
    console.log('[DAILY_DIGEST] Processing conversions for date:', digestDate, {
      dayStart,
      dayEnd,
    });

    // Query conversions needing a digest
    // Using raw query since Prisma client might not be regenerated yet
    const conversionsRaw = await prisma.$queryRawUnsafe(`
      SELECT
        rc.id,
        rc.referrerUserId,
        rc.referralCode,
        rc.buyerEmail,
        rc.stripeSessionId,
        rc.commissionCents,
        rc.createdAt,
        u.email AS referrerEmail
      FROM ReferralConversion rc
      JOIN User u ON u.id = rc.referrerUserId
      WHERE
        rc.createdAt >= ?
        AND rc.createdAt <= ?
        AND rc.lastDigestDate IS NULL
      ORDER BY rc.referrerUserId, rc.createdAt
    `, dayStart, dayEnd);

    if (!conversionsRaw || conversionsRaw.length === 0) {
      console.log('[DAILY_DIGEST] No conversions to process');
      return res.status(200).json({
        ok: true,
        message: 'No digests to send',
        digestDate,
        count: 0,
      });
    }

    // Group by referrer_user_id
    const byReferrer = new Map();
    for (const row of conversionsRaw) {
      const userId = row.referrerUserId;
      if (!byReferrer.has(userId)) {
        byReferrer.set(userId, []);
      }
      byReferrer.get(userId).push(row);
    }

    console.log(`[DAILY_DIGEST] Found ${byReferrer.size} referrers with conversions`);

    let successCount = 0;
    let errorCount = 0;

    // Process each referrer
    for (const [referrerUserId, conversions] of byReferrer.entries()) {
      try {
        const referrerEmail = conversions[0].referrerEmail;

        if (!referrerEmail) {
          console.warn(`[DAILY_DIGEST] Skipping referrer ${referrerUserId}: no email`);
          continue;
        }

        // Normalize conversions for email helper
        const digestConversions = conversions.map((c) => ({
          buyerEmail: c.buyerEmail,
          commissionCents: Number(c.commissionCents),
          createdAt: new Date(c.createdAt),
        }));

        // Send email
        await sendDailyReferralDigestEmail({
          referrerEmail,
          digestDate,
          conversions: digestConversions,
        });

        // Mark these conversions as included in the digest
        // Use date range update (more reliable than ID list)
        await prisma.$executeRawUnsafe(`
          UPDATE ReferralConversion
          SET lastDigestDate = ?
          WHERE referrerUserId = ?
            AND createdAt >= ?
            AND createdAt <= ?
            AND lastDigestDate IS NULL
        `, digestDate, referrerUserId, dayStart, dayEnd);

        successCount++;
        console.log(`[DAILY_DIGEST] Sent digest to ${referrerEmail} (${conversions.length} conversions)`);
      } catch (err) {
        errorCount++;
        console.error(`[DAILY_DIGEST] Error processing referrer ${referrerUserId}:`, err);
        // Continue with next referrer
      }
    }

    console.log(`[DAILY_DIGEST] Completed: ${successCount} sent, ${errorCount} errors`);

    return res.status(200).json({
      ok: true,
      digestDate,
      referrersProcessed: successCount,
      errors: errorCount,
      totalConversions: conversionsRaw.length,
    });
  } catch (err) {
    console.error('[DAILY_DIGEST] Fatal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

