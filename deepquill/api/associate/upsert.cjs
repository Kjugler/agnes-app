// deepquill/api/associate/upsert.cjs
// Associate profile upsert endpoint - canonical DB owner

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { customAlphabet } = require('nanoid');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 6;
const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);

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

async function ensureAssociateMinimal(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Invalid email address');
  }

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    const code = await generateUniqueCode();
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        code,
        referralCode: code,
        rabbitSeq: 1,
        rabbitTarget: 500,
      },
    });
    return user;
  }

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

  if (!user.rabbitTarget || !user.rabbitSeq) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitSeq: user.rabbitSeq && user.rabbitSeq > 0 ? user.rabbitSeq : 1,
        rabbitTarget: user.rabbitTarget && user.rabbitTarget > user.points
          ? user.rabbitTarget
          : 500,
      },
    });
  }

  return user;
}

function normalizePhone(input) {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return null;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function cleanHandle(handle) {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

async function handleAssociateUpsert(req, res) {
  try {
    const headerEmailRaw = req.headers['x-user-email'];
    if (!headerEmailRaw) {
      return res.status(400).json({
        ok: false,
        error: 'missing_user_email',
      });
    }

    const body = req.body || {};
    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const emailRaw = body.email || headerEmailRaw;
    const email = normalizeEmail(emailRaw);
    const headerEmail = normalizeEmail(headerEmailRaw);

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
      });
    }

    if (email !== headerEmail) {
      return res.status(400).json({
        ok: false,
        error: 'email_mismatch',
      });
    }

    const phone = normalizePhone(body.phone ?? null);
    const handles = body.handles ?? {};
    const handleX = cleanHandle(handles.x);
    const handleInstagram = cleanHandle(handles.instagram);
    const handleTiktok = cleanHandle(handles.tiktok);
    const handleTruth = cleanHandle(handles.truth);

    console.log('[associate/upsert] Processing request', {
      email,
      firstName,
      lastName,
      hasHandles: !!(handles.x || handles.instagram || handles.tiktok || handles.truth),
    });

    // Ensure user exists
    const base = await ensureAssociateMinimal(email);

    // Update user profile
    const updated = await prisma.user.update({
      where: { id: base.id },
      data: {
        fname: firstName,
        lname: lastName,
        firstName: firstName,
        phone,
        handleX,
        handleInstagram,
        handleTiktok,
        handleTruth,
      },
    });

    const name = updated.fname && updated.lname
      ? `${updated.fname} ${updated.lname}`
      : `${firstName} ${lastName}`.trim();

    console.log('[associate/upsert] Successfully upserted user', {
      id: updated.id,
      email: updated.email,
      code: updated.referralCode,
    });

    return res.json({
      ok: true,
      id: updated.id,
      email: updated.email,
      name,
      code: updated.referralCode,
    });
  } catch (err) {
    console.error('[associate/upsert] Error', {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: process.env.NODE_ENV === 'development' ? err?.message : 'An unexpected error occurred.',
    });
  }
}

module.exports = handleAssociateUpsert;
