import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';

export const RANK_STEP = 500;

export function calcNextRankThreshold(points: number) {
  const bands = Math.floor(points / RANK_STEP);
  return (bands + 1) * RANK_STEP;
}

export function calcInitialRabbitTarget(points: number) {
  const nextRank = calcNextRankThreshold(points);
  const base = points + 250;
  return Math.min(nextRank, base);
}

const selectUserFields = {
  id: true,
  email: true,
  code: true,
  referralCode: true,
  points: true,
  rabbitTarget: true,
  rabbitSeq: true,
} as const;

export type RabbitUser = {
  id: string;
  email: string;
  code: string;
  referralCode: string;
  points: number;
  rabbitTarget: number | null;
  rabbitSeq: number | null;
};

export async function findRabbitUser(email?: string | null, code?: string | null) {
  const normalizedEmail = email ? normalizeEmail(email) : '';
  const normalizedCode = (code ?? '').trim();

  if (normalizedEmail) {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: selectUserFields });
    if (user) return user as RabbitUser;
  }

  if (normalizedCode) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ code: normalizedCode }, { referralCode: normalizedCode }],
      },
      select: selectUserFields,
    });
    if (user) return user as RabbitUser;
  }

  return null;
}

export async function ensureRabbitState(user: RabbitUser) {
  const nextRankThreshold = calcNextRankThreshold(user.points);
  const target = user.rabbitTarget && user.rabbitTarget > user.points
    ? user.rabbitTarget
    : calcInitialRabbitTarget(user.points);
  const seq = user.rabbitSeq && user.rabbitSeq > 0 ? user.rabbitSeq : 1;

  if (target !== user.rabbitTarget || seq !== user.rabbitSeq) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitTarget: target,
        rabbitSeq: seq,
      },
      select: selectUserFields,
    });
    return { user: updated as RabbitUser, nextRankThreshold };
  }

  return { user, nextRankThreshold };
}
