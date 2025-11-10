'use server';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { RANK_STEP, ensureRabbitState, findRabbitUser } from '@/lib/rabbit';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const searchEmail = url.searchParams.get('email') ?? url.searchParams.get('mockEmail');
  const searchCode = url.searchParams.get('code') ?? url.searchParams.get('ref');

  const cookieStore = cookies();
  const cookieEmail = cookieStore.get('mockEmail')?.value ?? undefined;
  const cookieCode = cookieStore.get('ref')?.value ?? undefined;

  const user = await findRabbitUser(searchEmail ?? cookieEmail, searchCode ?? cookieCode);

  if (!user) {
    return NextResponse.json({
      points: 0,
      rabbitTarget: RANK_STEP / 2,
      rabbitSeq: 1,
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
