const { customAlphabet } = require('nanoid');
const { normalizeEmail, normalizePhone, isSyntheticReaderEmail } = require('../../src/lib/normalize.cjs');
const {
  buildSyntheticEmailForPhone,
  buildSyntheticEmailAnonymous,
} = require('./readerSyntheticEmail.cjs');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 6;
const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);

const MIN_NOTES_LENGTH = 3;

async function generateUniqueCode(prisma, excludeUserId) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const match = await prisma.user.findFirst({
      where: {
        AND: [
          excludeUserId ? { id: { not: excludeUserId } } : {},
          { OR: [{ code }, { referralCode: code }] },
        ],
      },
      select: { id: true },
    });
    if (!match) return code;
  }
  throw new Error('Unable to generate unique referral code');
}

async function backfillUserCodes(prisma, user) {
  const existingCode = (user.code || '').trim();
  const existingReferral = (user.referralCode || '').trim();
  if (existingCode && existingReferral) return user;

  const code = await generateUniqueCode(prisma, user.id);
  return prisma.user.update({
    where: { id: user.id },
    data: {
      code: existingCode || code,
      referralCode: existingReferral || code,
    },
  });
}

async function createReaderUser(prisma, { email, phone, firstName, lastName }) {
  const code = await generateUniqueCode(prisma);
  const data = {
    email,
    code,
    referralCode: code,
    rabbitSeq: 1,
    rabbitTarget: 500,
  };
  if (phone) data.phone = phone;
  if (firstName) {
    data.firstName = firstName;
    data.fname = firstName;
  }
  if (lastName) data.lname = lastName;

  const user = await prisma.user.create({ data });
  return { user, created: true };
}

/**
 * Validate at least one meaningful identifier:
 * email, phone, or name + notes.
 */
function validateReaderIdentifier({ email, phone, firstName, lastName, notes }) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && isSyntheticReaderEmail(normalizedEmail)) {
    return { ok: false, error: 'Invalid email address' };
  }

  const normalizedPhone = normalizePhone(phone);
  const hasName = Boolean((firstName || '').trim() || (lastName || '').trim());
  const trimmedNotes = (notes || '').trim();
  const hasNotes = trimmedNotes.length >= MIN_NOTES_LENGTH;

  if (normalizedEmail || normalizedPhone || (hasName && hasNotes)) {
    return {
      ok: true,
      normalizedEmail,
      normalizedPhone,
      hasName,
      hasNotes,
    };
  }

  return {
    ok: false,
    error: 'Provide email, phone number, or name plus notes (at least 3 characters).',
  };
}

/**
 * Ensure User exists with referral code for Reader Manager.
 * Supports real email, phone-only (synthetic email), or name+notes-only (synthetic email).
 */
async function ensureReaderContact(prisma, { email, phone, firstName, lastName, notes }) {
  const validation = validateReaderIdentifier({ email, phone, firstName, lastName, notes });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { normalizedEmail, normalizedPhone } = validation;

  if (normalizedEmail) {
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return createReaderUser(prisma, {
        email: normalizedEmail,
        phone: normalizedPhone,
        firstName,
        lastName,
      });
    }

    const updates = {};
    if (normalizedPhone && !(user.phone || '').trim()) {
      updates.phone = normalizedPhone;
    }
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
    user = await backfillUserCodes(prisma, user);
    return { user, created: false };
  }

  if (normalizedPhone) {
    let user = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
    if (user) {
      user = await backfillUserCodes(prisma, user);
      return { user, created: false };
    }

    const syntheticEmail = buildSyntheticEmailForPhone(normalizedPhone);
    const existingByEmail = await prisma.user.findUnique({ where: { email: syntheticEmail } });
    if (existingByEmail) {
      user = await backfillUserCodes(prisma, existingByEmail);
      if (!(user.phone || '').trim()) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { phone: normalizedPhone },
        });
      }
      return { user, created: false };
    }

    return createReaderUser(prisma, {
      email: syntheticEmail,
      phone: normalizedPhone,
      firstName,
      lastName,
    });
  }

  const syntheticEmail = buildSyntheticEmailAnonymous();
  return createReaderUser(prisma, {
    email: syntheticEmail,
    firstName,
    lastName,
  });
}

/** Ensure User exists with referral code — email-only path (legacy callers). */
async function ensureReaderUser(prisma, emailRaw) {
  const email = normalizeEmail(emailRaw);
  if (!email || isSyntheticReaderEmail(email)) {
    throw new Error('Invalid email address');
  }

  const result = await ensureReaderContact(prisma, { email });
  return result;
}

function appendNotes(existingNotes, newNote) {
  const trimmed = typeof newNote === 'string' ? newNote.trim() : '';
  if (!trimmed) return existingNotes || null;
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const block = `[${stamp}]\n${trimmed}`;
  if (!existingNotes || !existingNotes.trim()) return block;
  return `${existingNotes.trim()}\n\n${block}`;
}

function displayName(user) {
  const first = (user.firstName || user.fname || '').trim();
  const last = (user.lname || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return '';
}

module.exports = {
  MIN_NOTES_LENGTH,
  ensureReaderUser,
  ensureReaderContact,
  validateReaderIdentifier,
  appendNotes,
  displayName,
  backfillUserCodes,
};
