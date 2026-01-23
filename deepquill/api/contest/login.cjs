// deepquill/api/contest/login.cjs
// Contest login endpoint - DB owner (deepquill only)
// Ensures User exists, Associate Publisher code exists, sets contestJoinedAt

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail, extractNameFromEmail } = require('../../src/lib/normalize.cjs');
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
    const { email: emailRaw, origin } = req.body || {};

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

    console.log('[contest/login] Processing login', { email, origin });

    // Ensure User exists with Associate Publisher code
    const user = await ensureAssociateMinimal(email);

    // Set contestJoinedAt if not already set
    let isReturning = false;
    if (!user.contestJoinedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { contestJoinedAt: new Date() },
      });
    } else {
      isReturning = true;
    }

    // Determine greeting name: firstName (from contest form) > fname > extract from email
    let greetingName = user.firstName || user.fname;
    if (!greetingName) {
      greetingName = extractNameFromEmail(email);
    }

    // Return response
    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        contestJoinedAt: user.contestJoinedAt,
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
