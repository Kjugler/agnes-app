// deepquill/api/referral/validate.cjs
// Validate referral code - canonical DB owner

const { prisma } = require('../../server/prisma.cjs');
const { normalizeReferralCode } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');

async function handleValidateReferralCode(req, res) {
  try {
    ensureDatabaseUrl();
    
    const code = req.query?.code || req.body?.code;
    
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'code parameter is required',
      });
    }

    // Normalize code to uppercase
    const normalizedCode = normalizeReferralCode(code);
    if (!normalizedCode) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid code format',
      });
    }

    // Canonical rule: Any existing User.code is always valid
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { code: normalizedCode },
          { referralCode: normalizedCode },
        ],
      },
      select: {
        id: true,
        email: true,
        code: true,
        referralCode: true,
        firstName: true,
        fname: true,
        lname: true,
      },
    });

    if (!user) {
      console.log('[referral/validate] Code not found', { code: normalizedCode });
      return res.json({
        ok: false,
        valid: false,
        code: normalizedCode,
      });
    }

    console.log('[referral/validate] Code validated', {
      code: normalizedCode,
      userId: user.id,
      userCode: user.code,
      userReferralCode: user.referralCode,
    });

    return res.json({
      ok: true,
      valid: true,
      code: normalizedCode,
      userId: user.id,
      email: user.email,
      firstName: user.firstName || user.fname || null,
      lastName: user.lname || null,
    });
  } catch (err) {
    console.error('[referral/validate] error', err);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: err.message,
    });
  }
}

module.exports = handleValidateReferralCode;
