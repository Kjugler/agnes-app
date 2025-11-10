'use server';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const DEFAULT_STEP = 500;
const BONUS_POINTS = 500;

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

async function findUser(email?: string | null, code?: string | null) {
  const normalizedEmail = normalize(email);
  const normalizedCode = normalize(code);

  if (!normalizedEmail && !normalizedCode) return null;

  if (normalizedEmail) {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: selectUserFields,
    });
    if (user) return user;
  }

  if (normalizedCode) {
    return prisma.user.findFirst({
      where: {
        OR: [{ code: normalizedCode }, { referralCode: normalizedCode }],
      },
      select: selectUserFields,
    });
  }

  return null;
}

const selectUserFields = {
  id: true,
  email: true,
  code: true,
  referralCode: true,
  points: true,
  rabbitTarget: true,
  rabbitStep: true,
  rabbitCatches: true,
};

type UserShape = Awaited<ReturnType<typeof findUser>>;

function computeStep(catches: number, currentStep?: number | null) {
  const base = currentStep && currentStep >= DEFAULT_STEP ? currentStep : DEFAULT_STEP;
  const minimum = Math.max(base, DEFAULT_STEP);
  return Math.min(minimum, 2500); // ensure existing step respected but capped
}

function nextStepAfterCatch(catches: number) {
  return Math.min(DEFAULT_STEP + 100 * catches, 2500);
}

async function ensureRabbit(user: NonNullable<UserShape>) {
  const step = computeStep(user.rabbitCatches ?? 0, user.rabbitStep ?? DEFAULT_STEP);

  if (!user.rabbitTarget) {
    const target = user.points + step;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        rabbitStep: step,
        rabbitTarget: target,
      },
      select: { points: true, rabbitTarget: true, rabbitStep: true, rabbitCatches: true },
    });
    return { totalPoints: updated.points, rabbitTarget: updated.rabbitTarget, rabbitStep: updated.rabbitStep };
  }

  if (user.points >= user.rabbitTarget) {
    const newCatches = (user.rabbitCatches ?? 0) + 1;
    const newStep = nextStepAfterCatch(newCatches);
    const newTotal = user.points + BONUS_POINTS;
    const newTarget = newTotal + newStep;

    const [, updated] = await prisma.$transaction([
      prisma.ledger.create({
        data: {
          userId: user.id,
          type: 'RABBIT_BONUS',
          points: BONUS_POINTS,
          note: `Rabbit catch #${newCatches}`,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          points: { increment: BONUS_POINTS },
          rabbitCatches: { increment: 1 },
          rabbitStep: newStep,
          rabbitTarget: newTarget,
        },
        select: { points: true, rabbitTarget: true, rabbitStep: true, rabbitCatches: true },
      }),
    ]);

    return {
      totalPoints: updated.points,
      rabbitTarget: updated.rabbitTarget,
      rabbitStep: updated.rabbitStep,
    };
  }

  return {
    totalPoints: user.points,
    rabbitTarget: user.rabbitTarget,
    rabbitStep: user.rabbitStep ?? step,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const searchEmail = url.searchParams.get('email') ?? url.searchParams.get('mockEmail');
  const searchCode = url.searchParams.get('code') ?? url.searchParams.get('ref');

  const cookieStore = cookies();
  const cookieEmail = cookieStore.get('mockEmail')?.value ?? undefined;
  const cookieCode = cookieStore.get('ref')?.value ?? undefined;

  const user = await findUser(searchEmail ?? cookieEmail, searchCode ?? cookieCode);

  if (!user) {
    return NextResponse.json({ totalPoints: 0, rabbitTarget: null });
  }

  const result = await ensureRabbit(user);
  return NextResponse.json({ totalPoints: result.totalPoints, rabbitTarget: result.rabbitTarget });
}
