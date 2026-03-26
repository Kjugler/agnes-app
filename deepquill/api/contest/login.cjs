// deepquill/api/contest/login.cjs
// Contest login endpoint - DB owner (deepquill only)
// Ensures User exists, Associate Publisher code exists, sets contestJoinedAt

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail, extractNameFromEmail } = require('../../src/lib/normalize.cjs');
const { normalizeReferralCode } = require('../../src/lib/normalize.cjs');
const { recordLedgerEntry } = require('../../lib/ledger/recordLedger.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { customAlphabet } = require('nanoid');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 6;
const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);

/**
 * Generate a unique associate/referral code
 */
async function generateUniqueCode(excludeId) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const match = await prisma.user.findFirst({
      where: {
        AND: [
          excludeId ? { id: { not: excludeId } } : {},
          {
            OR: [{ code }, { referralCode: code }],
          },
        ],
      },
      select: { id: true },
    });
    if (!match) return code;
  }
  throw new Error('Unable to generate unique referral code');
}

/**
 * Ensure User exists and has Associate Publisher code
 */
async function ensureAssociateMinimal(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Invalid email address');
  }

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    // Create new user with code
    const code = await generateUniqueCode();
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        code,
        referralCode: code,
        rabbitSeq: 1,
        rabbitTarget: 500, // Initial rabbit target
      },
    });
    return user;
  }

  // Ensure user has code and referralCode
  if (!user.code || !user.referralCode) {
    const code = await generateUniqueCode(user.id);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        code: user.code || code,
        referralCode: user.referralCode || code,
      },
    });
  }

  // Ensure rabbit fields are set
  if (!user.rabbitTarget || !user.rabbitSeq) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitSeq: user.rabbitSeq && user.rabbitSeq > 0 ? user.rabbitSeq : 1,
        rabbitTarget: user.rabbitTarget && user.rabbitTarget > user.points
          ? user.rabbitTarget
          : 500, // Initial rabbit target
      },
    });
  }

  return user;
}

/**
 * Contest login handler
 * POST /api/contest/login
 * Body: { email: string, origin?: string }
 */
async function handleContestLogin(req, res) {
  try {
    const { email: emailRaw, origin, ref } = req.body || {};
    // Also check query params for ref (in case it comes from URL)
    const refFromQuery = req.query?.ref || req.query?.referralCode;

    if (!emailRaw || typeof emailRaw !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'email required',
      });
    }

    // Normalize email
    const email = normalizeEmail(emailRaw);
    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email address',
      });
    }

    // Part A3: Get referral code from body or query params
    const referralCodeRaw = ref || refFromQuery;
    let referrerUserId = null;
    let referrerReferralCode = null;

    console.log('[PRINCIPAL] Resolving principal for login', { email, origin, referralCodeRaw });

    // Ensure User exists with Associate Publisher code (canonical principal)
    const user = await ensureAssociateMinimal(email);

    // Part A3: If referral code present, validate and stamp lastReferral
    if (referralCodeRaw && typeof referralCodeRaw === 'string') {
      try {
        const normalizedRefCode = normalizeReferralCode(referralCodeRaw.trim());
        if (normalizedRefCode) {
          const referrerUser = await prisma.user.findFirst({
            where: {
              OR: [
                { code: normalizedRefCode },
                { referralCode: normalizedRefCode },
              ],
            },
            select: {
              id: true,
              code: true,
              referralCode: true,
            },
          });

          if (referrerUser && referrerUser.id !== user.id) {
            // Don't allow self-referral
            referrerUserId = referrerUser.id;
            referrerReferralCode = referrerUser.referralCode || referrerUser.code;

            // Update lastReferral fields on the logged-in user
            await prisma.user.update({
              where: { id: user.id },
              data: {
                lastReferredByUserId: referrerUserId,
                lastReferralCode: referrerReferralCode,
                lastReferralAt: new Date(),
                lastReferralSource: 'link',
                lastReferralEmail: email,
              },
            });

            console.log('[contest/login] Stamped lastReferral from referral link', {
              userId: user.id,
              email: user.email,
              referrerUserId,
              referrerReferralCode,
              source: 'link',
            });
          }
        }
      } catch (refErr) {
        // Non-blocking: log but don't fail login
        console.warn('[contest/login] Failed to process referral code', {
          error: refErr.message,
          referralCodeRaw,
        });
      }
    }

    // R1: Login must NOT auto-join the contest
    // contestJoinedAt is for analytics only - does NOT create CONTEST_JOIN ledger entry
    // Points are ONLY awarded via /api/contest/join endpoint when user explicitly submits form
    let isReturning = false;
    if (!user.contestJoinedAt) {
      // R7: Set contestJoinedAt for analytics (optional), but do NOT create ledger entry
      await prisma.user.update({
        where: { id: user.id },
        data: { contestJoinedAt: new Date() },
      });
      
      console.log('[contest/login] Contest joined timestamp set (analytics only)', {
        userId: user.id,
        email: user.email,
        note: 'contestJoinedAt is for analytics - join status comes from ledger only',
      });
    } else {
      isReturning = true;
      console.log('[contest/login] Returning user', {
        userId: user.id,
        email: user.email,
        contestJoinedAt: user.contestJoinedAt,
        note: 'contestJoinedAt is for analytics - join status comes from ledger only',
      });
    }

    // Determine greeting name: firstName (from contest form) > fname > extract from email
    let greetingName = user.firstName || user.fname;
    if (!greetingName) {
      greetingName = extractNameFromEmail(email);
    }

    // [PRINCIPAL] Log canonical identity resolution
    console.log('[PRINCIPAL] Principal resolved', {
      userId: user.id,
      email: user.email,
      code: user.code,
      referralCode: user.referralCode,
      method: 'email',
      isReturning,
    });

    // Return response with canonical userId and code
    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        contestJoinedAt: user.contestJoinedAt,
        code: user.code, // Include code for cookie
      },
      associate: {
        code: user.code,
      },
      greetingName,
      isReturning,
    });
  } catch (err) {
    console.error('[contest/login] Error', {
      error: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: err?.message || 'Internal server error',
    });
  }
}

module.exports = handleContestLogin;
