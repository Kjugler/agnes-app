export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureAssociateMinimal } from '@/lib/associate';
import { normalizeEmail } from '@/lib/email';
import { awardDailySharePoints, startOfToday } from '@/lib/dailySharePoints';
import { checkAndAwardRabbit1, getActionsSnapshot } from '@/lib/rabbitMissions';
import { proxyJson } from '@/lib/deepquillProxy';

const BOOK_POINTS = 500;

function mapAction(a: string) {
  switch (a) {
    case 'share_x':
    case 'share_twitter':
    case 'share_xcom':
      return { type: 'SHARE_X' as const, points: 100 };
    case 'share_ig':
    case 'share_instagram':
      return { type: 'SHARE_IG' as const, points: 100 };
    case 'share_fb':
      return { type: 'SHARE_FB' as const, points: 100 };
    case 'share_truth':
    case 'share_truthsocial':
    case 'share_truth_social':
      return { type: 'SHARE_TRUTH' as const, points: 100 };
    case 'share_tiktok':
      return { type: 'SHARE_TT' as const, points: 100 };
    case 'share_x_back_to_score_bonus':
      return { type: 'SHARE_X_BACK_BONUS' as const, points: 100 };
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

  const updated = await prisma.$transaction(async (tx: any) => {
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

  // Check and award Rabbit 1 after purchase
  const actionsSnapshot = await getActionsSnapshot(user.id);
  await checkAndAwardRabbit1(user.id, actionsSnapshot);

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
    let pointsAwarded = 0;

    // Handle daily share points using the helper function
    if (map.type === 'SHARE_FB') {
      pointsAwarded = await awardDailySharePoints(user.id, 'facebook');
      alreadyAwarded = pointsAwarded === 0;
    } else if (map.type === 'SHARE_X') {
      pointsAwarded = await awardDailySharePoints(user.id, 'x');
      alreadyAwarded = pointsAwarded === 0;
    } else if (map.type === 'SHARE_IG') {
      pointsAwarded = await awardDailySharePoints(user.id, 'instagram');
      alreadyAwarded = pointsAwarded === 0;
    } else if (map.type === 'SHARE_X_BACK_BONUS') {
      // Back-to-score bonus: once per day per user
      const exists = await prisma.ledger.findFirst({
        where: {
          userId: user.id,
          type: map.type,
          createdAt: { gte: startOfToday() },
        },
        select: { id: true },
      });
      alreadyAwarded = Boolean(exists);

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
        pointsAwarded = map.points;
      }
    } else if (
      map.points &&
      (map.type === 'SHARE_TRUTH' ||
        map.type === 'SHARE_TT' ||
        map.type === 'SIGNUP_BONUS')
    ) {
      // Other share types and signup bonus still use the old logic
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
        pointsAwarded = map.points;
      }
    } else if (map.points) {
      // Non-share actions (contest_join, subscribe_digest, etc.)
      // Proxy to deepquill for canonical DB writes
      try {
        const { data, status } = await proxyJson('/api/points/award', req, {
          method: 'POST',
          body: {
            kind: action,
            email: normalizedEmail,
          },
          headers: {
            'x-user-email': normalizedEmail,
            'x-admin-key': process.env.ADMIN_KEY || '',
          },
        });

        if (status === 200 && data?.ok) {
          pointsAwarded = data.awarded || 0;
          console.log('[points/award] Proxied to deepquill', {
            action,
            pointsAwarded,
            reason: data.reason,
          });
        } else {
          console.warn('[points/award] Deepquill proxy failed, falling back to local', {
            action,
            status,
            data,
          });
          // Fallback to local DB write (for backward compatibility)
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
          pointsAwarded = map.points;
        }
      } catch (proxyErr) {
        console.error('[points/award] Proxy error, falling back to local', {
          action,
          error: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
        });
        // Fallback to local DB write
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
        pointsAwarded = map.points;
      }
    }

    // Check and award Rabbit 1 if conditions are met
    // Check incoming event type (action) for purchase, not mapped type
    // Note: kind === 'book_purchase' causes early return, so we only check action here
    if (pointsAwarded > 0 || action === 'book_purchase' || action === 'PURCHASE_BOOK') {
      // Get updated actions snapshot after this event
      const actionsSnapshot = await getActionsSnapshot(user.id);
      await checkAndAwardRabbit1(user.id, actionsSnapshot);
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