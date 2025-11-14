export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureAssociateMinimal } from '@/lib/associate';
import { normalizeEmail } from '@/lib/email';

const BOOK_POINTS = 500;

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
    case 'share_tiktok':
      return { type: 'SHARE_TT' as const, points: 100 };
    case 'contest_join':
      return { type: 'CONTEST_JOIN' as const, points: 250 };
    case 'subscribe_digest':
      return { type: 'SUBSCRIBE_DIGEST' as const, points: 50 };
    case 'signup':
      return { type: 'SIGNUP_BONUS' as const, points: 100 };
    default:
      return null;
  }
}

async function handleBookPurchase(email: string) {
  const user = await ensureAssociateMinimal(email);

  if (user.earnedPurchaseBook) {
    return NextResponse.json({ ok: true, awarded: false, total: user.points });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.ledger.create({
      data: {
        userId: user.id,
        type: 'PURCHASE_BOOK',
        points: BOOK_POINTS,
        note: 'checkout bonus',
      },
    });

    return tx.user.update({
      where: { id: user.id },
      data: {
        points: { increment: BOOK_POINTS },
        earnedPurchaseBook: true,
      },
      select: { points: true },
    });
  });

  return NextResponse.json({ ok: true, awarded: true, total: updated.points });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind || body?.action;

    const headerEmail = req.headers.get('x-user-email');
    if (!headerEmail) {
      return NextResponse.json({ ok: false, error: 'missing_user_email' }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(headerEmail);

    if (kind === 'book_purchase') {
      return await handleBookPurchase(normalizedEmail);
    }

    const action = (body?.action ?? body?.kind) as string | undefined;

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

    const user = await ensureAssociateMinimal(normalizedEmail);

    let alreadyAwarded = false;
    if (
      map.points &&
      (map.type === 'SHARE_X' ||
        map.type === 'SHARE_IG' ||
        map.type === 'SHARE_FB' ||
        map.type === 'SHARE_TRUTH' ||
        map.type === 'SHARE_TT' ||
        map.type === 'SIGNUP_BONUS')
    ) {
      const exists = await prisma.ledger.findFirst({
        where: {
          userId: user.id,
          type: map.type,
          ...(map.type === 'SIGNUP_BONUS'
            ? {}
            : { createdAt: { gte: startOfToday() } }),
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