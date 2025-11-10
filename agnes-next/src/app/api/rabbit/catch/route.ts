'use server';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { calcInitialRabbitTarget, calcNextRankThreshold, ensureRabbitState, findRabbitUser } from '@/lib/rabbit';

const BONUS_POINTS = 500;

type Body = {
  rabbitSeqClient?: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const rabbitSeqClient = typeof body.rabbitSeqClient === 'number' ? body.rabbitSeqClient : undefined;

  const url = new URL(req.url);
  const searchEmail = url.searchParams.get('email') ?? url.searchParams.get('mockEmail');
  const searchCode = url.searchParams.get('code') ?? url.searchParams.get('ref');

  const cookieStore = cookies();
  const cookieEmail = cookieStore.get('mockEmail')?.value ?? undefined;
  const cookieCode = cookieStore.get('ref')?.value ?? undefined;

  const user = await findRabbitUser(searchEmail ?? cookieEmail, searchCode ?? cookieCode);

  if (!user) {
    return NextResponse.json({ ok: false, caught: false, error: 'user_not_found' }, { status: 404 });
  }

  const { user: ensured } = await ensureRabbitState(user);

  if (typeof rabbitSeqClient !== 'number' || rabbitSeqClient !== ensured.rabbitSeq) {
    return NextResponse.json({ ok: true, caught: false, stale: true });
  }

  if (!ensured.rabbitTarget || ensured.points < ensured.rabbitTarget) {
    return NextResponse.json({ ok: true, caught: false });
  }

  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({
      where: { id: ensured.id },
      select: {
        id: true,
        points: true,
        rabbitTarget: true,
        rabbitSeq: true,
      },
    });

    if (!fresh) {
      return { caught: false, error: 'user_not_found' } as const;
    }

    if (!fresh.rabbitTarget || fresh.points < fresh.rabbitTarget) {
      return { caught: false } as const;
    }

    if (fresh.rabbitSeq !== rabbitSeqClient) {
      return { caught: false, stale: true } as const;
    }

    const nextPoints = fresh.points + BONUS_POINTS;
    const nextRankThreshold = calcNextRankThreshold(nextPoints);
    const nextTarget = calcInitialRabbitTarget(nextPoints);

    await tx.ledger.create({
      data: {
        userId: fresh.id,
        type: 'RABBIT_BONUS',
        points: BONUS_POINTS,
        note: `rabbit seq ${fresh.rabbitSeq}`,
      },
    });

    const updated = await tx.user.update({
      where: { id: fresh.id },
      data: {
        points: nextPoints,
        rabbitTarget: nextTarget,
        rabbitSeq: { increment: 1 },
        lastRabbitCatchAt: new Date(),
      },
      select: {
        points: true,
        rabbitTarget: true,
        rabbitSeq: true,
      },
    });

    return {
      caught: true as const,
      points: updated.points,
      rabbitTarget: updated.rabbitTarget,
      rabbitSeq: updated.rabbitSeq,
      nextRankThreshold,
    };
  });

  if (!('caught' in result)) {
    return NextResponse.json({ ok: false, caught: false, error: 'unknown' }, { status: 500 });
  }

  if (!result.caught) {
    return NextResponse.json({ ok: true, caught: false, stale: result.stale ?? false });
  }

  return NextResponse.json({
    ok: true,
    caught: true,
    points: result.points,
    rabbitTarget: result.rabbitTarget,
    rabbitSeq: result.rabbitSeq,
    nextRankThreshold: result.nextRankThreshold,
  });
}
