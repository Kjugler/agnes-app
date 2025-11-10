export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;

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

async function resolveUserByCodeOrEmail(code?: string | null, email?: string | null) {
  const normalizedCode = code?.trim();
  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedCode) {
    const userByCode = await prisma.user.findFirst({
      where: {
        OR: [{ code: normalizedCode }, { referralCode: normalizedCode }],
      },
    });
    if (userByCode) return userByCode;
  }

  if (normalizedEmail) {
    return prisma.user.findUnique({ where: { email: normalizedEmail } });
  }

  return null;
}

async function handleBookPurchase(req: NextRequest, body: any) {
  if (!stripe) {
    return NextResponse.json({ ok: false, error: 'stripe_unavailable' }, { status: 500 });
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'session_required' }, { status: 400 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details'],
    });
  } catch (err) {
    console.error('[points/award] failed to retrieve checkout session', err);
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 404 });
  }

  const cookieStore = cookies();
  const cookieRef = cookieStore.get('ref')?.value ?? null;
  const cookieEmail = cookieStore.get('mockEmail')?.value ?? null;

  const candidateCodes: (string | null | undefined)[] = [
    body?.associateCode,
    cookieRef,
    session.metadata?.associateCode,
    session.metadata?.ref,
  ];
  const candidateEmails: (string | null | undefined)[] = [
    body?.email,
    cookieEmail,
    session.metadata?.mockEmail,
    session.customer_details?.email,
    session.customer_email,
  ];

  let user = null;
  for (const code of candidateCodes) {
    user = await resolveUserByCodeOrEmail(code, undefined);
    if (user) break;
  }
  if (!user) {
    for (const email of candidateEmails) {
      user = await resolveUserByCodeOrEmail(undefined, email);
      if (user) break;
    }
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 });
  }

  const existing = await prisma.ledger.findFirst({
    where: {
      userId: user.id,
      type: 'PURCHASE_BOOK',
      note: { contains: `session:${sessionId}` },
    },
    select: { id: true },
  });

  if (existing) {
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { points: true },
    });
    return NextResponse.json({ ok: true, awarded: false, total: fresh?.points ?? user.points });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.ledger.create({
      data: {
        userId: user.id,
        type: 'PURCHASE_BOOK',
        points: BOOK_POINTS,
        note: `checkout bonus session:${sessionId}`,
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
    const { searchParams } = new URL(req.url);
    const mockEmailParam = searchParams.get('mockEmail');

    const cookieStore = cookies();
    const mockEmailCookie = cookieStore.get('mockEmail')?.value;

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind || body?.action;

    if (kind === 'book_purchase') {
      return await handleBookPurchase(req, body);
    }

    const email = mockEmailParam || mockEmailCookie;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'no identity in dev' },
        { status: 401 }
      );
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
        map.type === 'SHARE_TRUTH' ||
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