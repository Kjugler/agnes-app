// agnes-next/src/app/api/admin/moderation/approve-signal/route.ts
// DEV-ONLY: Approve a Signal for moderation
// ⚠️ DO NOT EXPOSE IN PRODUCTION WITHOUT PROPER AUTH

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

// Guard: Only allow in development or with admin key
// 1.3: In dev, allow no header. In prod, require x-admin-key.
function isAuthorized(req: NextRequest): boolean {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // Dev mode: allow without header
    return true;
  }
  
  // Production: require admin key
  const adminKey = req.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_KEY;
  
  if (!expectedKey) {
    console.warn('[admin/moderation] ADMIN_KEY not set - endpoint disabled in production');
    return false;
  }
  
  return adminKey === expectedKey;
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
        { error: 'Missing or invalid signal id' },
        { status: 400 }
      );
    }

    // Update signal status to APPROVED
    const updated = await prisma.signal.update({
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

    console.log('[admin/moderation] Signal approved', { signalId: id, userId: updated.userId });

    // Award points for signal approval (call deepquill endpoint)
    if (updated.userId) {
      try {
        const deepquillUrl = process.env.DEEPQUILL_URL || 'http://localhost:5055';
        const awardResponse = await fetch(`${deepquillUrl}/api/points/award`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'signal_approved',
            userId: updated.userId,
            signalId: id,
          }),
        });

        if (!awardResponse.ok) {
          const errorText = await awardResponse.text().catch(() => 'unknown error');
          console.warn('[admin/moderation] Failed to award points for signal', {
            signalId: id,
            status: awardResponse.status,
            error: errorText,
            deepquillUrl: `${deepquillUrl}/api/points/award`,
          });
        } else {
          const awardData = await awardResponse.json();
          console.log('[admin/moderation] ✅ Points awarded for signal', {
            signalId: id,
            userId: updated.userId,
            awarded: awardData.awarded,
            reason: awardData.reason,
            deepquillUrl: `${deepquillUrl}/api/points/award`,
          });
        }
      } catch (err: any) {
        console.error('[admin/moderation] Error awarding points for signal', {
          signalId: id,
          error: err.message,
        });
        // Don't fail the approval if points fail
      }
    }

    return NextResponse.json({
      ok: true,
      signal: {
        id: updated.id,
        status: updated.status,
        approvedAt: updated.approvedAt,
        userId: updated.userId,
      },
    });
  } catch (err: any) {
    console.error('[admin/moderation] Error approving signal', err);
    
    if (err.code === 'P2025') {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: err.message || 'Failed to approve signal' },
      { status: 500 }
    );
  }
}
