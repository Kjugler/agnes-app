export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapAction(a: string) {
  switch (a) {
    case 'share_x':
      return { type: 'SHARE_X' as const, points: 100 };
    case 'share_ig':
      return { type: 'SHARE_IG' as const, points: 100 };
    case 'share_fb':
      return { type: 'SHARE_FB' as const, points: 100 };
    case 'share_truth':
      return { type: 'SHARE_TRUTH' as const, points: 100 };
    case 'contest_join':
      return { type: 'CONTEST_JOIN' as const, points: 250 };
    case 'subscribe_digest':
      return { type: 'SUBSCRIBE_DIGEST' as const, points: 50 };
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mockEmailParam = searchParams.get('mockEmail');
    
    const cookieStore = await cookies();
    const mockEmailCookie = cookieStore.get('mockEmail')?.value;

    const email = mockEmailParam || mockEmailCookie;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'no identity in dev' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (!action) {
      return NextResponse.json(
        { ok: false, error: 'missing action' },
        { status: 400 }
      );
    }

    const map = mapAction(action);
    if (!map) {
      return NextResponse.json(
        { ok: false, error: 'invalid action' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    let alreadyAwarded = false;
    if (
      map.points &&
      (map.type === 'SHARE_X' ||
        map.type === 'SHARE_IG' ||
        map.type === 'SHARE_FB' ||
        map.type === 'SHARE_TRUTH')
    ) {
      const exists = await prisma.ledger.findFirst({
        where: {
          userId: user.id,
          type: map.type,
          createdAt: { gte: startOfToday() },
        },
        select: { id: true },
      });
      alreadyAwarded = Boolean(exists);
    }

    if (!alreadyAwarded && map.points) {
      await prisma.$transaction([
        prisma.ledger.create({
          data: {
            userId: user.id,
            type: map.type,
            points: map.points,
            note: `Auto award ${action}`,
          },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { points: { increment: map.points } },
        }),
      ]);
    }

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { points: true },
    });

    return NextResponse.json({
      ok: true,
      awarded: !alreadyAwarded,
      alreadyAwarded,
      total: fresh?.points ?? user.points,
    });
  } catch (err: any) {
    console.error('[points/award] error', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to award points' },
      { status: 500 }
    );
  }
}