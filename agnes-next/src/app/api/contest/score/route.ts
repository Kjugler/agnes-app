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
  
  // Check if Order model is available (might need Prisma client regeneration)
  if (!prisma.order) {
    console.error('[contest/score] Prisma Order model not available. Available models:', {
      hasUser: !!prisma.user,
      hasPurchase: !!prisma.purchase,
      hasOrder: !!prisma.order,
      hasCustomer: !!prisma.customer,
    });
    throw new Error('Order model not found. Please run: npx prisma generate && npx prisma migrate dev');
  }

  // 1. Find Order by stripeSessionId
  let order;
  try {
    order = await prisma.order.findUnique({
      where: { stripeSessionId: sessionId },
      include: {
        customer: {
          select: {
            email: true,
          },
        },
      },
    });
  } catch (err: any) {
    console.error('[contest/score] Error finding order', {
      error: err?.message,
      sessionId,
    });
    throw err;
  }

  if (!order) {
    // Order not found - try to get player by email from session if possible
    // For now, return null to indicate no order found
    return null;
  }

  // 2. Get related ContestPlayer (User)
  // Try contestPlayerId first, then fall back to customer email
  let player: { id: string; points: number } | null = null;

  if (order.contestPlayerId) {
    const userById = await prisma.user.findUnique({
      where: { id: order.contestPlayerId },
      select: { id: true, points: true },
    });
    if (userById) {
      player = userById;
    }
  }

  if (!player && order.customer?.email) {
    const userByEmail = await prisma.user.findUnique({
      where: { email: order.customer.email },
      select: { id: true, points: true },
    });
    if (userByEmail) {
      player = userByEmail;
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

  try {
    // Fetch all purchases for this user to calculate purchase points
    purchases = await prisma.purchase.findMany({
      where: { userId: player.id },
      select: {
        amount: true,
        currency: true,
      },
    });

    // Fetch ledger entries to calculate different point types
    ledgerEntries = await prisma.ledger.findMany({
      where: { userId: player.id },
      select: {
        type: true,
        points: true,
      },
    });

    // Also check events for purchase completions (for backward compatibility)
    purchaseEvents = await prisma.event.findMany({
      where: {
        userId: player.id,
        type: 'PURCHASE_COMPLETED',
      },
      select: { id: true },
    });
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

  // Count purchase points from ledger
  for (const entry of ledgerEntries) {
    if (entry.type === 'PURCHASE_BOOK') {
      purchasePoints += entry.points;
    } else if (entry.type === 'REFER_FRIEND_PAYOUT') {
      referralPoints += entry.points;
    } else {
      // All other types count as base points
      basePoints += entry.points;
    }
  }

  // If we have purchase events but no purchase points in ledger, add them
  // (This handles legacy data)
  if (purchaseEvents.length > 0 && purchasePoints === 0) {
    // Use a default purchase bonus if ledger doesn't have it
    purchasePoints = purchaseEvents.length * 500; // Default purchase bonus
  }

  const totalPoints = player.points;

  return {
    totalPoints,
    basePoints,
    purchasePoints,
    referralPoints,
    playerId: player.id,
    orderId: order.id,
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
      // Order not found yet - return a graceful default response
      // Try to get player by email if we can extract it from the session
      // For now, return zeros with a message
      console.log('[contest/score] No order found for session_id', trimmedSessionId);
      return NextResponse.json({
        totalPoints: 0,
        basePoints: 0,
        purchasePoints: 0,
        referralPoints: 0,
        message: 'Order not found yet. The webhook may still be processing.',
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

