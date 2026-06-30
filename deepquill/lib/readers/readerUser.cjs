const { customAlphabet } = require('nanoid');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 6;
const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);

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

/** Ensure User exists with referral code — same rules as associate upsert; no referral logic changes. */
async function ensureReaderUser(prisma, emailRaw) {
  const email = normalizeEmail(emailRaw);
  if (!email) {
    throw new Error('Invalid email address');
  }

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const code = await generateUniqueCode(prisma);
    user = await prisma.user.create({
      data: {
        email,
        code,
        referralCode: code,
        rabbitSeq: 1,
        rabbitTarget: 500,
      },
    });
    return { user, created: true };
  }

  const existingCode = (user.code || '').trim();
  const existingReferral = (user.referralCode || '').trim();
  if (!existingCode || !existingReferral) {
    const code = await generateUniqueCode(prisma, user.id);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        code: existingCode || code,
        referralCode: existingReferral || code,
      },
    });
  }

  return { user, created: false };
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
  ensureReaderUser,
  appendNotes,
  displayName,
};
