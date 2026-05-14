const { customAlphabet } = require('nanoid');
const { normalizeEmail, extractNameFromEmail } = require('../../src/lib/normalize.cjs');

const GUEST_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GUEST_CODE_SIZE = 6;
const generateGuestUserCode = customAlphabet(GUEST_CODE_ALPHABET, GUEST_CODE_SIZE);

async function generateUniqueGuestUserCode(prismaClient, excludeUserId) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const code = generateGuestUserCode();
    const clash = await prismaClient.user.findFirst({
      where: {
        AND: [
          excludeUserId ? { id: { not: excludeUserId } } : {},
          { OR: [{ code }, { referralCode: code }] },
        ],
      },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new Error('[guestStripeBuyer] Unable to generate unique guest user code');
}

/**
 * Catalog / Stripe checkout without contest cookies: find User by Stripe customer email, or create a minimal guest row.
 * POST /api/contest/login with the same email returns this User — purchases and points remain merged.
 */
async function findOrCreateGuestUserForStripePurchase(prismaClient, emailRaw, nameFromStripe) {
  const normalizedEmail = normalizeEmail(emailRaw);
  if (!normalizedEmail) {
    return { user: null, resolution: 'unresolved_missing_email', created: false };
  }

  let user = await prismaClient.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (user) {
    if (!user.code || !user.referralCode) {
      const code = await generateUniqueGuestUserCode(prismaClient, user.id);
      user = await prismaClient.user.update({
        where: { id: user.id },
        data: {
          code: user.code || code,
          referralCode: user.referralCode || code,
        },
      });
    }
    return { user, resolution: 'email_existing_user', created: false };
  }

  const code = await generateUniqueGuestUserCode(prismaClient);
  const display =
    (typeof nameFromStripe === 'string' && nameFromStripe.trim()) ||
    extractNameFromEmail(normalizedEmail) ||
    'Reader';

  try {
    user = await prismaClient.user.create({
      data: {
        email: normalizedEmail,
        firstName: display,
        fname: display,
        code,
        referralCode: code,
        rabbitSeq: 1,
        rabbitTarget: 500,
      },
    });
    return { user, resolution: 'email_new_guest_user', created: true };
  } catch (createErr) {
    if (createErr.code === 'P2002') {
      const raceUser = await prismaClient.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (raceUser) {
        return { user: raceUser, resolution: 'email_existing_user', created: false };
      }
    }
    throw createErr;
  }
}

module.exports = {
  findOrCreateGuestUserForStripePurchase,
  generateUniqueGuestUserCode,
};
