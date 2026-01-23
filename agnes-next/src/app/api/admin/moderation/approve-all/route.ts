// agnes-next/src/app/api/admin/moderation/approve-all/route.ts
// DEV-ONLY: Approve all pending Signals and Reviews
// ⚠️ DO NOT EXPOSE IN PRODUCTION WITHOUT PROPER AUTH

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

// Track 2.1: Admin endpoints must be dead in production
// Guard: Only allow in development OR with valid admin key
function isAuthorized(req: NextRequest): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  
  // Production: Hard block unless admin key is provided AND matches
  if (isProd) {
    const adminKey = req.headers.get('x-admin-key');
    const expectedKey = process.env.ADMIN_KEY;
    
    if (!expectedKey) {
      console.warn('[admin/moderation] ADMIN_KEY not set - endpoint HARD BLOCKED in production');
      return false;
    }
    
    if (adminKey !== expectedKey) {
      console.warn('[admin/moderation] Invalid or missing admin key - endpoint BLOCKED in production');
      return false;
    }
    
    return true;
  }
  
  // Development: allow without header (for local testing)
  return true;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Forbidden - Development only or valid x-admin-key required' },
      { status: 403 }
    );
  }

  try {
    // Find all pending signals
    const pendingSignals = await prisma.signal.findMany({
      where: {
        status: { in: ['HELD'] },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    // Find all pending reviews
    const pendingReviews = await prisma.review.findMany({
      where: {
        status: { in: ['HELD'] },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    const now = new Date();

    // Approve all signals
    const approvedSignals = await prisma.signal.updateMany({
      where: {
        id: { in: pendingSignals.map((s: { id: string }) => s.id) },
      },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        heldAt: null,
        heldReason: null,
      },
    });

    // Approve all reviews
    const approvedReviews = await prisma.review.updateMany({
      where: {
        id: { in: pendingReviews.map((r: { id: string }) => r.id) },
      },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        heldAt: null,
        heldReason: null,
      },
    });

    console.log('[admin/moderation] Approved all pending items', {
      signals: approvedSignals.count,
      reviews: approvedReviews.count,
    });

    // Award points for approved signals
    const deepquillUrl = process.env.DEEPQUILL_URL || 'http://localhost:5055';
    let signalsAwarded = 0;
    let reviewsAwarded = 0;

    for (const signal of pendingSignals) {
      if (signal.userId) {
        try {
          const awardResponse = await fetch(`${deepquillUrl}/api/points/award`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'signal_approved',
              userId: signal.userId,
              signalId: signal.id,
            }),
          });

          if (awardResponse.ok) {
            const awardData = await awardResponse.json();
            signalsAwarded++;
            console.log('[admin/moderation] ✅ Points awarded for signal', {
              signalId: signal.id,
              userId: signal.userId,
              awarded: awardData.awarded,
            });
          } else {
            const errorText = await awardResponse.text().catch(() => 'unknown error');
            console.warn('[admin/moderation] Failed to award points for signal', {
              signalId: signal.id,
              status: awardResponse.status,
              error: errorText,
            });
          }
        } catch (err: any) {
          console.warn('[admin/moderation] Error awarding points for signal', {
            signalId: signal.id,
            error: err?.message || String(err),
          });
        }
      }
    }

    // Award points for approved reviews
    for (const review of pendingReviews) {
      if (review.userId) {
        try {
          const awardResponse = await fetch(`${deepquillUrl}/api/points/award`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'review_approved',
              userId: review.userId,
              reviewId: review.id,
            }),
          });

          if (awardResponse.ok) {
            const awardData = await awardResponse.json();
            reviewsAwarded++;
            console.log('[admin/moderation] ✅ Points awarded for review', {
              reviewId: review.id,
              userId: review.userId,
              awarded: awardData.awarded,
            });
          } else {
            const errorText = await awardResponse.text().catch(() => 'unknown error');
            console.warn('[admin/moderation] Failed to award points for review', {
              reviewId: review.id,
              status: awardResponse.status,
              error: errorText,
            });
          }
        } catch (err: any) {
          console.warn('[admin/moderation] Error awarding points for review', {
            reviewId: review.id,
            error: err?.message || String(err),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      approved: {
        signals: approvedSignals.count,
        reviews: approvedReviews.count,
      },
      pointsAwarded: {
        signals: signalsAwarded,
        reviews: reviewsAwarded,
      },
    });
  } catch (err: any) {
    console.error('[admin/moderation] Error approving all', err);
    return NextResponse.json(
      { error: err.message || 'Failed to approve all' },
      { status: 500 }
    );
  }
}
