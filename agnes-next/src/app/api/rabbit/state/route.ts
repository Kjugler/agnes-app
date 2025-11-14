'use server';

import { NextRequest, NextResponse } from 'next/server';
import { RANK_STEP, ensureRabbitState, findRabbitUser } from '@/lib/rabbit';
import { ensureAssociateMinimal } from '@/lib/associate';
import { normalizeEmail } from '@/lib/email';

export async function GET(req: NextRequest) {

  const headerEmail = req.headers.get('x-user-email');
  if (!headerEmail) {
    return NextResponse.json({ error: 'missing_user_email' }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(headerEmail);
  const baseUser = await ensureAssociateMinimal(normalizedEmail);
  const user = await findRabbitUser(normalizedEmail, baseUser.code);

  if (!user) {
    return NextResponse.json({
      points: baseUser.points ?? 0,
      rabbitTarget: baseUser.rabbitTarget ?? RANK_STEP / 2,
      rabbitSeq: baseUser.rabbitSeq ?? 1,
      nextRankThreshold: RANK_STEP,
    });
  }

  const { user: ensured, nextRankThreshold } = await ensureRabbitState(user);

  return NextResponse.json({
    points: ensured.points,
    rabbitTarget: ensured.rabbitTarget,
    rabbitSeq: ensured.rabbitSeq,
    nextRankThreshold,
  });
}
