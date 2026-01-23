// agnes-next/src/app/api/admin/moderation/approve-review/route.ts
// DEV-ONLY: Approve a Review for moderation
// ⚠️ DO NOT EXPOSE IN PRODUCTION WITHOUT PROPER AUTH

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

// Track 2.1: Admin endpoints must be dead in production
function isAuthorized(req: NextRequest): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  
  if (isProd) {
    const adminKey = req.headers.get('x-admin-key');
    const expectedKey = process.env.ADMIN_KEY;
    
    if (!expectedKey || adminKey !== expectedKey) {
      return false;
    }
    return true;
  }
  
  // Development: allow without header
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
    const body = await req.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid review id' },
        { status: 400 }
      );
    }

    // Update review status to APPROVED
    const updated = await prisma.review.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        heldAt: null,
        heldReason: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    console.log('[admin/moderation] Review approved', { reviewId: id, userId: updated.userId });

    // Award points for review approval (call deepquill endpoint)
    if (updated.userId) {
      try {
        const deepquillUrl = process.env.DEEPQUILL_URL || 'http://localhost:5055';
        const awardResponse = await fetch(`${deepquillUrl}/api/points/award`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'review_approved',
            userId: updated.userId,
            reviewId: id,
          }),
        });

        if (!awardResponse.ok) {
          const errorText = await awardResponse.text().catch(() => 'unknown error');
          console.warn('[admin/moderation] Failed to award points for review', {
            reviewId: id,
            status: awardResponse.status,
            error: errorText,
            deepquillUrl: `${deepquillUrl}/api/points/award`,
          });
        } else {
          const awardData = await awardResponse.json();
          console.log('[admin/moderation] ✅ Points awarded for review', {
            reviewId: id,
            userId: updated.userId,
            awarded: awardData.awarded,
            reason: awardData.reason,
            deepquillUrl: `${deepquillUrl}/api/points/award`,
          });
        }
      } catch (err: any) {
        console.error('[admin/moderation] Error awarding points for review', {
          reviewId: id,
          error: err.message,
        });
        // Don't fail the approval if points fail
      }
    }

    return NextResponse.json({
      ok: true,
      review: {
        id: updated.id,
        status: updated.status,
        approvedAt: updated.approvedAt,
        userId: updated.userId,
      },
    });
  } catch (err: any) {
    console.error('[admin/moderation] Error approving review', err);
    
    if (err.code === 'P2025') {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: err.message || 'Failed to approve review' },
      { status: 500 }
    );
  }
}
