export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    // Get email from query param (dev) or cookie (dev), or later from auth session (prod)
    const { searchParams } = new URL(req.url);
    const mockEmailParam = searchParams.get('mockEmail');
    
    const cookieStore = await cookies();
    const mockEmailCookie = cookieStore.get('mockEmail')?.value;

    const email = mockEmailParam || mockEmailCookie;

    console.log('[points/me] Request', { 
      mockEmailParam, 
      mockEmailCookie, 
      emailUsed: email 
    });

    if (!email) {
      console.log('[points/me] No email provided, returning zeros');
      return NextResponse.json({
        total: 0,
        firstName: null,
        earned: { purchase_book: false, share_x: false, share_ig: false },
        referrals: {
          friends_purchased_count: 0,
          earnings_week_usd: 0,
        },
        recent: [],
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        ledger: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    console.log('[points/me] User lookup', { 
      emailSearched: email.toLowerCase(), 
      found: !!user, 
      userId: user?.id,
      points: user?.points 
    });

    if (!user) {
      console.log('[points/me] User not found, returning zeros');
      return NextResponse.json({
        total: 0,
        firstName: null,
        earned: { purchase_book: false, share_x: false, share_ig: false },
        referrals: {
          friends_purchased_count: 0,
          earnings_week_usd: 0,
        },
        recent: [],
      });
    }

    // Get referral payouts (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const referralLedgers = await prisma.ledger.findMany({
      where: {
        userId: user.id,
        type: 'REFER_FRIEND_PAYOUT',
        createdAt: { gte: weekAgo },
      },
    });

    const friendsPurchasedCount = await prisma.ledger.count({
      where: {
        userId: user.id,
        type: 'REFER_FRIEND_PAYOUT',
      },
    });

    const earningsWeekUsd = referralLedgers.reduce((sum, ledger) => {
      return sum + Number(ledger.usd);
    }, 0);

    // Format recent ledger entries
    const recent = user.ledger.map((entry) => ({
      ts: entry.createdAt.toISOString(),
      label: entry.note || `${entry.type} - ${entry.points > 0 ? `+${entry.points} pts` : ''} ${Number(entry.usd) > 0 ? `+$${Number(entry.usd).toFixed(2)}` : ''}`,
      deltaPts: entry.points,
      deltaUsd: Number(entry.usd),
    }));

    console.log('[points/me] Returning data', {
      total: user.points,
      firstName: user.firstName || user.fname,
      earnedPurchaseBook: user.earnedPurchaseBook,
    });

    return NextResponse.json({
      total: user.points,
      firstName: user.firstName || user.fname || null,
      earned: {
        purchase_book: user.earnedPurchaseBook,
        share_x: false, // TODO: implement share tracking
        share_ig: false, // TODO: implement share tracking
      },
      referrals: {
        friends_purchased_count: friendsPurchasedCount,
        earnings_week_usd: earningsWeekUsd,
      },
      recent,
    });
  } catch (err: any) {
    console.error('[points/me] error', err);
    return NextResponse.json(
      { error: 'Failed to fetch points' },
      { status: 500 }
    );
  }
}// ... rest of the code stays the same ...