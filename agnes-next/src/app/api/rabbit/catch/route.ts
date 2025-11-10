'use server';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const DEFAULT_STEP = 500;
const BONUS_POINTS = 500;

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
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

type Body = {
  email?: string | null;
  code?: string | null;
};

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

function ensureStep(step?: number | null) {
  const value = step ?? DEFAULT_STEP;
  return Math.max(DEFAULT_STEP, Math.min(value, 2500));
}

function nextStepAfterCatch(catches: number) {
  return Math.min(DEFAULT_STEP + 100 * catches, 2500);
}

async function ensureRabbit(user: NonNullable<UserShape>) {
  const step = ensureStep(user.rabbitStep);

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
    return updated;
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

    return updated;
  }

  return {
    points: user.points,
    rabbitTarget: user.rabbitTarget,
    rabbitStep: user.rabbitStep ?? step,
    rabbitCatches: user.rabbitCatches,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const url = new URL(req.url);

  const searchEmail = body.email ?? url.searchParams.get('email') ?? url.searchParams.get('mockEmail');
  const searchCode = body.code ?? url.searchParams.get('code') ?? url.searchParams.get('ref');

  const cookieStore = cookies();
  const cookieEmail = cookieStore.get('mockEmail')?.value ?? undefined;
  const cookieCode = cookieStore.get('ref')?.value ?? undefined;

  const user = await findUser(searchEmail ?? cookieEmail, searchCode ?? cookieCode);

  if (!user) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 });
  }

  const updated = await ensureRabbit(user);
  return NextResponse.json({
    ok: true,
    totalPoints: updated.points,
    rabbitTarget: updated.rabbitTarget,
    rabbitStep: updated.rabbitStep,
    rabbitCatches: updated.rabbitCatches,
  });
}
