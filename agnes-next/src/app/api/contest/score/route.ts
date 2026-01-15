import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Get player score by session_id
 * Returns null if order not found, or a score object with breakdown
 */
async function getPlayerScoreBySessionId(sessionId: string) {
  // Verify prisma is available
  if (!prisma) {
    console.error('[contest/score] Prisma client not available');
    throw new Error('Database client not initialized. Please restart the dev server after running: npx prisma generate');
  }
  
  // Check if Purchase model is available (we use Purchase, not Order)
  if (!prisma.purchase) {
    console.error('[contest/score] Prisma Purchase model not available. Available models:', {
      hasUser: !!prisma.user,
      hasPurchase: !!prisma.purchase,
    });
    throw new Error('Purchase model not found. Please run: npx prisma generate && npx prisma migrate dev');
  }

  // 1. Find Purchase by stripeSessionId (this is what the webhook creates)
  let purchase;
  try {
    purchase = await prisma.purchase.findUnique({
      where: { stripeSessionId: sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            points: true,
          },
        },
      },
    });
  } catch (err: any) {
    console.error('[contest/score] Error finding purchase', {
      error: err?.message,
      sessionId,
    });
    throw err;
  }

  if (!purchase) {
    // Purchase not found - return null to indicate no purchase found
    // This could mean the webhook hasn't processed it yet, or it failed
    return null;
  }

  // 2. Get related User (already included in purchase.user)
  let player: { id: string; points: number } | null = null;

  if (purchase.user) {
    player = {
      id: purchase.user.id,
      points: purchase.user.points,
    };
  } else if (purchase.userId) {
    // Fallback: fetch user if not included
    const userById = await prisma.user.findUnique({
      where: { id: purchase.userId },
      select: { id: true, points: true },
    });
    if (userById) {
      player = userById;
    }
  }

  if (!player) {
    // Player not found - return null
    return null;
  }

  // 3. Calculate score breakdown
  let purchases: Array<{ amount: number | null; currency: string | null }> = [];
  let ledgerEntries: Array<{ type: string; points: number }> = [];
  let purchaseEvents: Array<{ id: string }> = [];
  let purchasePointsFromPurchases = 0; // Declare at function scope

  try {
    // Fetch all purchases for this user to calculate purchase points
    purchases = await prisma.purchase.findMany({
      where: { userId: player.id },
      select: {
        amountPaidCents: true,
        product: true,
        pointsAwarded: true,
      },
    }).catch(() => []); // Return empty array if query fails
    
    // Calculate purchase points from Purchase records (more reliable than ledger)
    purchasePointsFromPurchases = purchases.reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);

    // Ledger removed - using Purchase records only
    ledgerEntries = [];

    // Also check events for purchase completions (for backward compatibility, if Event table exists)
    try {
      purchaseEvents = await prisma.event.findMany({
        where: {
          userId: player.id,
          type: 'PURCHASE_COMPLETED',
        },
        select: { id: true },
      });
    } catch (eventErr: any) {
      // Event table might not exist - that's okay, we'll use Purchase records instead
      if (eventErr?.code === 'P2021' || eventErr?.message?.includes('Event')) {
        console.warn('[contest/score] Event table not available, using Purchase records only', {
          error: eventErr?.message,
        });
        purchaseEvents = [];
      } else {
        // Re-throw if it's a different error
        throw eventErr;
      }
    }
  } catch (err: any) {
    console.error('[contest/score] Error fetching player data', {
      error: err?.message,
      playerId: player.id,
    });
    // Continue with empty arrays - we'll still return the player's total points
  }

  // Calculate breakdown
  let purchasePoints = 0;
  let referralPoints = 0;
  let basePoints = 0;

  // Purchase points calculated from Purchase records (Ledger removed)
  // purchasePoints already set from purchases above
  // Referral points and base points are calculated from User.points - purchasePoints
  // (Ledger removed, so we can't break down referral vs base points separately)

  // Use purchase points from Purchase records if available (most reliable)
  if (purchasePointsFromPurchases > 0) {
    purchasePoints = purchasePointsFromPurchases;
  } else if (purchaseEvents.length > 0 && purchasePoints === 0) {
    // Fallback: If we have purchase events but no Purchase records, estimate from events
    // (This handles legacy data or webhook failures)
    purchasePoints = purchaseEvents.length * 500; // Default purchase bonus
  }

  const totalPoints = player.points;

  return {
    totalPoints,
    basePoints,
    purchasePoints,
    referralPoints,
    playerId: player.id,
    purchaseId: purchase.id,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return NextResponse.json(
        { error: 'session_id query parameter is required' },
        { status: 400 }
      );
    }

    const trimmedSessionId = sessionId.trim();
    console.log('[contest/score] Fetching score for session_id', trimmedSessionId);

    const score = await getPlayerScoreBySessionId(trimmedSessionId);

    if (!score) {
      // Purchase not found yet - return a graceful default response
      // The webhook may still be processing, or the purchase wasn't recorded
      console.log('[contest/score] No purchase found for session_id', trimmedSessionId);
      return NextResponse.json({
        totalPoints: 0,
        basePoints: 0,
        purchasePoints: 0,
        referralPoints: 0,
        purchaseFound: false,
        message: 'Purchase not found yet. The webhook may still be processing.',
      });
    }

    console.log('[contest/score] Score found', {
      totalPoints: score.totalPoints,
      purchasePoints: score.purchasePoints,
    });

    return NextResponse.json({
      totalPoints: score.totalPoints,
      basePoints: score.basePoints,
      purchasePoints: score.purchasePoints,
      referralPoints: score.referralPoints,
      purchaseFound: true,
      earnedPurchaseBook: true, // Purchase exists, so book was earned
    });
  } catch (err: any) {
    console.error('[contest/score] Error fetching score', {
      error: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch score',
        message: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

