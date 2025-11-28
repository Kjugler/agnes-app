// deepquill/api/award-referral-commission.cjs
// Note: This assumes DeepQuill has access to the same database as agnes-next
// You may need to install @prisma/client: npm install @prisma/client
// And ensure DATABASE_URL is set in DeepQuill's .env

const express = require('express');
const router = express.Router();

// Try to use Prisma if available, otherwise fall back to raw SQL
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (err) {
  console.warn('[REFERRALS] Prisma not available, will need raw SQL implementation');
  // TODO: Implement raw SQL fallback if Prisma is not available
}

// Auth middleware: verify API token
function authApiToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.DEEPQUILL_API_TOKEN;

  if (!expectedToken) {
    console.error('[REFERRALS][AUTH] DEEPQUILL_API_TOKEN not configured');
    return res.status(500).json({ error: 'Server not configured' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (token !== expectedToken) {
    console.warn('[REFERRALS][AUTH] Invalid token attempt');
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

router.post('/award-commission', authApiToken, async (req, res) => {
  try {
    const { referralCode, buyerEmail, stripeSessionId, commissionCents } = req.body;

    console.log('[REFERRALS][AWARD_COMMISSION] Request received', {
      referralCode,
      buyerEmail: buyerEmail ? '***' : null,
      stripeSessionId,
      commissionCents,
    });

    // 1) Validate input
    if (
      typeof referralCode !== 'string' ||
      !referralCode.trim() ||
      typeof stripeSessionId !== 'string' ||
      !stripeSessionId.trim()
    ) {
      return res.status(400).json({ error: 'Missing referralCode or stripeSessionId' });
    }

    const cents = Number(commissionCents);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: 'Invalid commissionCents' });
    }

    // 2) Lookup referrer by referral code
    const referrer = await prisma.user.findFirst({
      where: {
        referralCode: referralCode.trim(),
      },
      select: {
        id: true,
      },
    });

    if (!referrer) {
      // If code is invalid, just log + 200 (don't break webhook)
      console.warn('[REFERRALS] Unknown referralCode', referralCode);
      return res.status(200).json({
        ok: true,
        message: 'Unknown referral code; no commission applied.',
      });
    }

    const referrerUserId = referrer.id;

    // 3) Idempotency: check if this session was already processed
    const existingConversion = await prisma.referralConversion.findUnique({
      where: {
        stripeSessionId: stripeSessionId.trim(),
      },
    });

    if (existingConversion) {
      console.info('[REFERRALS] Conversion already recorded for session', stripeSessionId);
      return res.status(200).json({
        ok: true,
        message: 'Conversion already recorded.',
      });
    }

    // 4) Insert conversion and update earnings in a transaction
    await prisma.$transaction(async (tx) => {
      // Create referral conversion record
      await tx.referralConversion.create({
        data: {
          referrerUserId,
          referralCode: referralCode.trim(),
          buyerEmail: buyerEmail ? buyerEmail.trim() : null,
          stripeSessionId: stripeSessionId.trim(),
          commissionCents: cents,
        },
      });

      // Update referrer earnings
      await tx.user.update({
        where: { id: referrerUserId },
        data: {
          referralEarningsCents: {
            increment: cents,
          },
        },
      });
    });

    console.log('[REFERRALS][AWARD_COMMISSION] Commission awarded successfully', {
      referralCode,
      referrerUserId,
      commissionCents: cents,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[REFERRALS][AWARD_COMMISSION] error', err);
    
    // Handle unique constraint violation (idempotency)
    if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
      console.info('[REFERRALS] Conversion already recorded (unique constraint)');
      return res.status(200).json({
        ok: true,
        message: 'Conversion already recorded.',
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

