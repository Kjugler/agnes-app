// File: src/app/api/points/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Inputs we accept (either query string or JSON body)
type PointsInput = {
  sessionId?: string | null;
  email?: string | null;
};

function isNonEmpty(s?: string | null) {
  return typeof s === 'string' && s.trim().length > 0;
}

function getInput(req: NextRequest): PointsInput {
  const { searchParams } = new URL(req.url);
  return {
    sessionId: searchParams.get('sessionId'),
    email: searchParams.get('email'),
  };
}

async function readJsonSafe<T = any>(req: NextRequest): Promise<T | null> {
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      return (await req.json()) as T;
    }
  } catch {}
  return null;
}

// --- Simple points rules (tweak anytime) ---
const POINTS_PER_PURCHASE = 100;
const POINTS_PER_USD = 1;
// -------------------------------------------

export async function GET(req: NextRequest) {
  return handlePoints(req);
}

export async function POST(req: NextRequest) {
  return handlePoints(req);
}

async function handlePoints(req: NextRequest) {
  try {
    const body = (await readJsonSafe<PointsInput>(req)) || {};
    const inline = getInput(req);

    const sessionId = isNonEmpty(body.sessionId)
      ? body.sessionId!.trim()
      : isNonEmpty(inline.sessionId)
      ? inline.sessionId!.trim()
      : undefined;

    const email = isNonEmpty(body.email)
      ? body.email!.trim().toLowerCase()
      : isNonEmpty(inline.email)
      ? inline.email!.trim().toLowerCase()
      : undefined;

    if (!sessionId && !email) {
      return NextResponse.json({ error: 'Provide sessionId or email.' }, { status: 400 });
    }

    // Resolve the actor (user)
    // 1) If sessionId is provided, find the Purchase → userId → User
    let user: { id: string; email: string } | null = null;

    if (sessionId) {
      const purchase = await prisma.purchase.findUnique({
        where: { sessionId },
        select: { userId: true },
      });

      if (purchase?.userId) {
        const u = await prisma.user.findUnique({
          where: { id: purchase.userId },
          select: { id: true, email: true },
        });
        if (u) user = u;
      }
    }

    // 2) Otherwise, or if not found, try by email
    if (!user && email) {
      const u2 = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });
      if (u2) user = u2;
    }

    if (!user) {
      // We couldn’t resolve a user; still return a neutral score
      return NextResponse.json({
        actor: { id: null, displayName: email ? maskEmail(email) : 'Guest' },
        totalPoints: 0,
        breakdown: {
          purchases: 0,
          purchaseEvents: 0,
          amountUsdFloor: 0,
          purchasePoints: 0,
          amountPoints: 0,
        },
        recent: [],
        rival: {
          label: 'Rabbit',
          points: 100,
          gap: 100,
          tip: 'Earn points by purchasing, sharing, and completing challenges.',
        },
      });
    }

    // Fetch recent events for this user
    const recentEvents = await prisma.event.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        type: true,
        createdAt: true,
      },
    });

    // Fetch purchases for this user
    const purchases = await prisma.purchase.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        amount: true,   // cents
        currency: true, // 'usd' | null
        createdAt: true,
      },
    });

    // Compute points
    let purchaseEventCount = 0;
    for (const ev of recentEvents) {
      if (ev.type === 'PURCHASE_COMPLETED') purchaseEventCount += 1;
    }

    let amountUsdFloor = 0;
    for (const p of purchases) {
      if ((p.currency || '').toLowerCase() === 'usd' && typeof p.amount === 'number') {
        amountUsdFloor += Math.floor(p.amount / 100); // cents → dollars, floor
      }
    }

    const amountPoints = amountUsdFloor * POINTS_PER_USD;
    const purchasePoints = purchaseEventCount * POINTS_PER_PURCHASE;
    const totalPoints = amountPoints + purchasePoints;

    const breakdown = {
      purchases: purchases.length,
      purchaseEvents: purchaseEventCount,
      amountUsdFloor,
      purchasePoints,
      amountPoints,
    };

    const rabbitTarget = totalPoints < 75 ? 100 : Math.ceil((totalPoints + 25) / 25) * 25;
    const rival = {
      label: 'Rabbit',
      points: rabbitTarget,
      gap: Math.max(rabbitTarget - totalPoints, 0),
      tip: 'Earn points by purchasing, sharing, and completing challenges.',
    };

    const displayName = user.email ? maskEmail(user.email) : 'Player';

    return NextResponse.json({
      actor: { id: user.id, displayName },
      totalPoints,
      breakdown,
      recent: recentEvents.map((e) => ({
        id: e.id,
        type: e.type,
        at: e.createdAt,
        sessionId: null, // not stored on Event in current schema
      })),
      rival,
    });
  } catch (err) {
    console.error('[points] error', err);
    return NextResponse.json({ error: 'Failed to compute points.' }, { status: 500 });
  }
}

function maskEmail(email: string) {
  const [u, d] = email.split('@');
  if (!d) return 'User';
  const u2 = u.length <= 2 ? u[0] + '…' : u[0] + '…' + u.slice(-1);
  const d2 = d.split('.').map((seg, i) => (i === 0 ? seg[0] + '…' : seg)).join('.');
  return `${u2}@${d2}`;
}