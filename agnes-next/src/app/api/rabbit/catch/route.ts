'use server';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calcInitialRabbitTarget, calcNextRankThreshold, ensureRabbitState, findRabbitUser } from '@/lib/rabbit';
import { ensureAssociateMinimal } from '@/lib/associate';
import { normalizeEmail } from '@/lib/email';

const BONUS_POINTS = 500;

type Body = {
  rabbitSeqClient?: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const rabbitSeqClient = typeof body.rabbitSeqClient === 'number' ? body.rabbitSeqClient : undefined;

  const headerEmail = req.headers.get('x-user-email');
  if (!headerEmail) {
    return NextResponse.json({ ok: false, caught: false, error: 'missing_user_email' }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(headerEmail);
  const baseUser = await ensureAssociateMinimal(normalizedEmail);
  const user = await findRabbitUser(normalizedEmail, baseUser.code);

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

    if (typeof rabbitSeqClient !== 'number' || fresh.rabbitSeq !== rabbitSeqClient) {
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
