export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureAssociateMinimal } from '@/lib/associate';
import { normalizeEmail } from '@/lib/email';
import { hasDailySharePoints, startOfToday } from '@/lib/dailySharePoints';

export async function GET(req: NextRequest) {
  try {
    const headerEmail = req.headers.get('x-user-email');
    if (!headerEmail) {
      return NextResponse.json({ error: 'missing_user_email' }, { status: 400 });
    }

    const email = normalizeEmail(headerEmail);

    console.log('[points/me] Request', { emailUsed: email });

    if (!email) {
      return NextResponse.json({
        total: 0,
        firstName: null,
        earned: { purchase_book: false, share_x: false, share_ig: false },
        dailyShares: {
          facebookEarnedToday: false,
          xEarnedToday: false,
          instagramEarnedToday: false,
        },
        rabbit1Completed: false,
        lastEvent: null,
        referrals: {
          friends_purchased_count: 0,
          earnings_week_usd: 0,
        },
        recent: [],
      });
    }

    await ensureAssociateMinimal(email);

    // Fetch user (no Ledger dependency)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    console.log('[points/me] User lookup', { 
      emailSearched: email, 
      found: !!user, 
      userId: user?.id,
      points: user?.points 
    });

    if (!user) {
      console.log('[points/me] User not found after ensure, returning zeros');
      return NextResponse.json({
        total: 0,
        firstName: null,
        earned: { purchase_book: false, share_x: false, share_ig: false },
        dailyShares: {
          facebookEarnedToday: false,
          xEarnedToday: false,
          instagramEarnedToday: false,
        },
        rabbit1Completed: false,
        lastEvent: null,
        referrals: {
          friends_purchased_count: 0,
          earnings_week_usd: 0,
        },
        recent: [],
      });
    }

    // Get referral conversions for the current week (Monday-Sunday)
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday = 0
    startOfWeek.setHours(0, 0, 0, 0);

    // Use raw query for now until Prisma client is regenerated
    // After running `npx prisma generate`, this can use prisma.referralConversion
    const referralConversionsRaw = await prisma.$queryRaw<Array<{ commissionCents: number }>>`
      SELECT commissionCents
      FROM ReferralConversion
      WHERE referrerUserId = ${user.id}
        AND createdAt >= ${startOfWeek}
    `;

    // Calculate weekly earnings from referral conversions (in cents, convert to USD)
    const earningsWeekCents = referralConversionsRaw.reduce((sum: number, conv: { commissionCents: number }) => {
      return sum + conv.commissionCents;
    }, 0);
    const earningsWeekUsd = earningsWeekCents / 100;

    // Count total friends who purchased (all-time)
    const friendsPurchasedCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM ReferralConversion
      WHERE referrerUserId = ${user.id}
    `;
    const friendsPurchasedCount = Number(friendsPurchasedCountResult[0]?.count || 0);

    // Recent activity (empty array - Ledger removed)
    const recent: Array<{ ts: string; label: string; deltaPts: number; deltaUsd: number }> = [];

    // Determine if this is a first-time visitor (created within last hour)
    // Users created more than 1 hour ago are considered returning visitors
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const createdNow = user.createdAt > oneHourAgo;

    // Daily share checks disabled (Ledger removed)
    const facebookEarnedToday = false;
    const xEarnedToday = false;
    const instagramEarnedToday = false;

    // Determine lastEvent from most recent purchase (Ledger removed)
    let lastEvent: { type: string; referrerName?: string | null } | null = null;
    const mostRecentPurchase = await prisma.purchase.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    
    if (mostRecentPurchase) {
      lastEvent = {
        type: 'purchase_book',
        referrerName: null,
      };
    }

    console.log('[points/me] Returning data', {
      total: user.points,
      firstName: user.firstName || user.fname,
      earnedPurchaseBook: user.earnedPurchaseBook,
      rabbit1Completed: user.rabbit1Completed,
      createdNow,
      dailyShares: {
        facebookEarnedToday,
        xEarnedToday,
        instagramEarnedToday,
      },
      lastEvent,
    });

    return NextResponse.json({
      total: user.points,
      firstName: user.firstName || user.fname || null,
      createdNow,
      earned: {
        purchase_book: user.earnedPurchaseBook,
        share_x: false, // TODO: implement share tracking
        share_ig: false, // TODO: implement share tracking
      },
      dailyShares: {
        facebookEarnedToday,
        xEarnedToday,
        instagramEarnedToday,
      },
      rabbit1Completed: user.rabbit1Completed,
      lastEvent,
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
}