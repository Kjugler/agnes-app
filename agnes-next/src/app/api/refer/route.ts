import { NextRequest, NextResponse } from 'next/server';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';
import { logReferralInvite } from '@/lib/referrals/logReferralInvite';
import { prisma } from '@/lib/db';
import { startOfToday } from '@/lib/dailySharePoints';
import { rateLimitByIP, rateLimitByEmail } from '@/lib/rateLimit';
import { proxyJson } from '@/lib/deepquillProxy';

type ReferRequestBody = {
  friendEmails: string[]; // REQUIRED, non-empty
  videoId: ReferVideoId;
  referralCode: string;
  referrerEmail?: string; // Optional, for Reply-To
};

export async function POST(req: NextRequest) {
  // Track 2.4: Rate limiting
  const rateLimit = rateLimitByIP(req, { maxRequests: 5, windowMs: 60000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  // Dev-only diagnostic logging to verify env values inside the running Next process
  if (process.env.NODE_ENV === 'development') {
    console.log('[ENV CHECK] EMAIL_CONTEST_BANNER =', process.env.EMAIL_CONTEST_BANNER);
    console.log('[ENV CHECK] SITE_URL =', process.env.SITE_URL);
    console.log('[ENV CHECK] NEXT_PUBLIC_SITE_URL =', process.env.NEXT_PUBLIC_SITE_URL);
  }

  try {
    const body = await req.json();

    // Parse and validate friendEmails array
    const friendEmailsRaw = Array.isArray(body.friendEmails)
      ? body.friendEmails
      : [];

    const emails: string[] = friendEmailsRaw
      .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
      .filter(Boolean) as string[];

    if (emails.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one valid email address.' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.filter((e: string) => !emailRegex.test(e));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `These don't look like valid emails: ${invalid.join(
            ', '
          )}. Please fix and try again.`,
        },
        { status: 400 }
      );
    }

    // Get referrer email (optional, for Reply-To) - single canonical declaration
    const referrerEmailFromBody =
      typeof body.referrerEmail === 'string' ? body.referrerEmail.trim() : '';
    const referrerEmail = referrerEmailFromBody || undefined; // Convert empty string to undefined

    // Track 2.4: Additional rate limiting by email (prevent spam)
    if (referrerEmail) {
      const emailRateLimit = rateLimitByEmail(referrerEmail, { maxRequests: 10, windowMs: 3600000 }); // 10 per hour
      if (!emailRateLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many referral requests. Please try again later.' },
          { status: 429 }
        );
      }
    }

    const videoId = body.videoId as ReferVideoId;
    const referralCode = (body.referralCode || '').trim();

    if (!videoId || !['fb1', 'fb2', 'fb3'].includes(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID. Must be fb1, fb2, or fb3.' },
        { status: 400 }
      );
    }

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Missing referral code.' },
        { status: 400 }
      );
    }

    // Determine origin from request headers (for deepquill to use)
    const origin = req.headers.get('origin') || 
                   (req.headers.get('x-forwarded-host') ? 
                     `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}` :
                     null) ||
                   process.env.NEXT_PUBLIC_SITE_URL ||
                   null;

    console.log('[Refer] Determined origin', { origin });

    // Find the user by referral code
    const user = await prisma.user.findUnique({
      where: { referralCode },
      select: { id: true, email: true, firstName: true, fname: true, lname: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid referral code.' },
        { status: 400 }
      );
    }

    // Get referrer's full name for email personalization
    const referrerName =
      [user.firstName, user.lname].filter(Boolean).join(" ") ||
      [user.fname, user.lname].filter(Boolean).join(" ") ||
      null;

    // Points constants
    const MAX_EMAILS_PER_DAY = 20;
    const MAX_POINTS_PER_DAY = 100;
    const POINTS_PER_EMAIL = 5;

    // Check today's referral email activity
    const todayStart = startOfToday();
    const todayReferralEmails = await prisma.ledger.findMany({
      where: {
        userId: user.id,
        type: 'REFER_EMAIL',
        createdAt: { gte: todayStart },
      },
      select: { points: true },
    });

    const emailsSentToday = todayReferralEmails.length;
    const pointsFromEmailsToday = todayReferralEmails.reduce(
      (sum: number, entry: { points: number }) => sum + entry.points,
      0
    );

    // Calculate remaining capacity
    const remainingEmails = Math.max(0, MAX_EMAILS_PER_DAY - emailsSentToday);
    const remainingPoints = Math.max(0, MAX_POINTS_PER_DAY - pointsFromEmailsToday);

    console.log('[Refer] Sending referral emails', {
      emailCount: emails.length,
      referralCode,
      videoId,
      origin,
      referrerEmail: referrerEmail || '(not provided)',
      userId: user.id,
      emailsSentToday,
      pointsFromEmailsToday,
      remainingEmails,
      remainingPoints,
    });

    // Send emails via deepquill (secrets stay backend)
    let deepquillResult: { ok: boolean; sent: number; failed: number; errors?: Array<{ email: string; error: string }> } | null = null;
    
    try {
      console.log('[Refer] Proxying email send to deepquill', {
        emailCount: emails.length,
        referralCode,
        videoId,
        origin,
      });

      const { data, status } = await proxyJson('/api/referrals/invite', req, {
        method: 'POST',
        body: {
          emails,
          referralCode,
          videoId,
          referrerEmail,
          origin,
          channel: 'email',
        },
        headers: {
          'x-internal-proxy': process.env.INTERNAL_PROXY_SECRET || 'dev-only-secret',
        },
      });

      if (status !== 200 || !data?.ok) {
        console.error('[Refer] Deepquill email send failed', { status, data });
        return NextResponse.json(
          { error: data?.error || 'Failed to send referral emails. Please try again.' },
          { status: status >= 400 && status < 600 ? status : 500 }
        );
      }

      deepquillResult = data;
      console.log('[Refer] Deepquill email send succeeded', {
        sent: data.sent,
        failed: data.failed,
      });
    } catch (error: unknown) {
      console.error('[Refer] Error proxying to deepquill:', error);
      return NextResponse.json(
        { error: 'Failed to send referral emails. Please try again.' },
        { status: 500 }
      );
    }

    // IMPORTANT: Only award points if email send succeeded
    // Gate points on deepquill returning ok:true and sent > 0
    if (!deepquillResult || !deepquillResult.ok || deepquillResult.sent === 0) {
      return NextResponse.json(
        { error: 'Failed to send referral emails. Please try again.' },
        { status: 500 }
      );
    }

    // Process points for successfully sent emails
    const results: Array<{
      email: string;
      pointsAwarded: number;
      sent: boolean;
    }> = [];

    // Track running totals as we process emails
    let currentEmailsSent = emailsSentToday;
    let currentPointsAwarded = pointsFromEmailsToday;

    // Process emails sequentially (not in parallel) to correctly track caps
    for (const friendEmail of emails) {
      // Check if we're still under caps
      const eligibleForPoints =
        currentEmailsSent < MAX_EMAILS_PER_DAY &&
        currentPointsAwarded < MAX_POINTS_PER_DAY;
      
      let pointsForThisEmail = 0;
      if (eligibleForPoints) {
        const pointsRemaining = MAX_POINTS_PER_DAY - currentPointsAwarded;
        pointsForThisEmail = Math.min(POINTS_PER_EMAIL, pointsRemaining);
      }

      // Log referral invite (non-blocking)
      try {
        await logReferralInvite({
          referralCode,
          friendEmail,
          videoId,
          channel: 'email',
        });
      } catch (err: unknown) {
        console.warn('[Refer] Failed to log referral invite (non-blocking)', err);
      }

      // Award points if eligible (always record in ledger, even if 0 points)
      if (pointsForThisEmail > 0) {
        await prisma.$transaction([
          prisma.ledger.create({
            data: {
              userId: user.id,
              type: 'REFER_EMAIL',
              points: pointsForThisEmail,
              note: `Referral email sent to ${friendEmail}`,
            },
          }),
          prisma.user.update({
            where: { id: user.id },
            data: { points: { increment: pointsForThisEmail } },
          },
          ),
        ]);
        currentPointsAwarded += pointsForThisEmail;
        console.log('[POINTS] Awarded', pointsForThisEmail, 'points for refer_email to', friendEmail, {
          userId: user.id,
          totalPointsAfter: currentPointsAwarded,
        });
      } else {
        // Still record in ledger for audit trail (0 points)
        await prisma.ledger.create({
          data: {
            userId: user.id,
            type: 'REFER_EMAIL',
            points: 0,
            note: `Referral email sent to ${friendEmail} (daily cap reached)`,
          },
        });
        console.log('[POINTS] Referral email sent but no points awarded (daily cap reached)', {
          userId: user.id,
          friendEmail,
          emailsSentToday: currentEmailsSent,
          pointsFromEmailsToday: currentPointsAwarded,
        });
      }

      currentEmailsSent += 1;

      results.push({
        email: friendEmail,
        pointsAwarded: pointsForThisEmail,
        sent: true,
      });
    }

    // Calculate final totals (use tracked values)
    const totalPointsAwarded = results.reduce((sum, r) => sum + r.pointsAwarded, 0);
    const finalEmailsSentToday = currentEmailsSent;
    const finalPointsFromEmailsToday = currentPointsAwarded;

    return NextResponse.json({
      success: true,
      emailsSent: emails.length,
      pointsAwarded: totalPointsAwarded,
      daily: {
        emailsSentToday: finalEmailsSentToday,
        pointsFromEmailsToday: finalPointsFromEmailsToday,
        maxEmailsPerDay: MAX_EMAILS_PER_DAY,
        maxPointsPerDay: MAX_POINTS_PER_DAY,
      },
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Refer] Error handling referral request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

