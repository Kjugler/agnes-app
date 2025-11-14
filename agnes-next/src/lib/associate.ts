import { prisma } from '@/lib/db';
import { customAlphabet } from 'nanoid';
import { calcInitialRabbitTarget } from '@/lib/rabbit';
import { normalizeEmail } from '@/lib/email';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 6;
const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);

export type AssociateProfile = {
  fname?: string | null;
  lname?: string | null;
  firstName?: string | null;
  phone?: string | null;
  handleX?: string | null;
  handleInstagram?: string | null;
  handleTiktok?: string | null;
  handleTruth?: string | null;
};

async function generateUniqueCode(excludeId?: string) {
  for (let i = 0; i < 10; i += 1) {
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

function mapProfileToUpdate(data?: AssociateProfile) {
  if (!data) return {};
  return {
    fname: data.fname ?? null,
    lname: data.lname ?? null,
    firstName: data.firstName ?? data.fname ?? null,
    phone: data.phone ?? null,
    handleX: data.handleX ?? null,
    handleInstagram: data.handleInstagram ?? null,
    handleTiktok: data.handleTiktok ?? null,
    handleTruth: data.handleTruth ?? null,
  };
}

export async function ensureAssociateMinimal(emailRaw: string) {
  const email = normalizeEmail(emailRaw);
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    const code = await generateUniqueCode();
    user = await prisma.user.create({
      data: {
        email,
        code,
        referralCode: code,
        rabbitSeq: 1,
        rabbitTarget: calcInitialRabbitTarget(0),
      },
    });
    return user;
  }

  const needsRabbit = !user.rabbitTarget || !user.rabbitSeq;
  if (needsRabbit) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitSeq: user.rabbitSeq && user.rabbitSeq > 0 ? user.rabbitSeq : 1,
        rabbitTarget: user.rabbitTarget && user.rabbitTarget > user.points
          ? user.rabbitTarget
          : calcInitialRabbitTarget(user.points ?? 0),
      },
    });
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

  return user;
}

export async function upsertAssociateByEmail(emailRaw: string, profile?: AssociateProfile) {
  const email = normalizeEmail(emailRaw);
  const updateData = mapProfileToUpdate(profile);
  const base = await ensureAssociateMinimal(email);
  const updated = await prisma.user.update({
    where: { id: base.id },
    data: updateData,
  });
  return updated;
}
