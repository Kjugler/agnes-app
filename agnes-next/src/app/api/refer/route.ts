import { NextRequest, NextResponse } from 'next/server';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';
import { sendReferralEmail } from '@/lib/email/referralEmail';
import { logReferralInvite } from '@/lib/referrals/logReferralInvite';
import { prisma } from '@/lib/db';
import { startOfToday } from '@/lib/dailySharePoints';

// SITE_URL: Use process.env.SITE_URL for referral email links
// In dev, set SITE_URL to your public ngrok URL so emails link correctly:
//   SITE_URL=https://agnes-dev.ngrok-free.app
// In production, set it to your real domain.
const SITE_URL = process.env.SITE_URL || '';

// Helper to build absolute URLs for referral emails (never use localhost)
function withBase(path: string): string {
  if (!SITE_URL) {
    throw new Error('SITE_URL environment variable is required for referral emails');
  }
  const url = `${SITE_URL.replace(/\/+$/, '')}${path}`;
  return url;
}

type ReferRequestBody = {
  friendEmails: string[]; // REQUIRED, non-empty
  videoId: ReferVideoId;
  referralCode: string;
  referrerEmail?: string; // Optional, for Reply-To
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Parse and validate friendEmails array
    const friendEmailsRaw = Array.isArray(body.friendEmails)
      ? body.friendEmails
      : [];

    const emails = friendEmailsRaw
      .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
      .filter(Boolean);

    if (emails.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one valid email address.' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.filter((e) => !emailRegex.test(e));
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

    // Find video config
    const videoConfig =
      REFER_VIDEOS.find((v) => v.id === videoId) ?? REFER_VIDEOS[0];

    // Build referral URL using SITE_URL (never localhost)
    const referralUrl = withBase(
      `/refer?code=${encodeURIComponent(referralCode)}&v=${encodeURIComponent(videoConfig.id)}&src=email`
    );

    // Build thumbnail URL using SITE_URL
    const thumbnailUrl = withBase(videoConfig.thumbnailSrc);

    // Log for debugging
    console.log('[Refer] Built referralUrl', {
      referralUrl,
      SITE_URL: process.env.SITE_URL,
    });

    // Get referrer email (optional, for Reply-To)
    const referrerEmail =
      typeof body.referrerEmail === 'string' ? body.referrerEmail.trim() : undefined;

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
      (sum, entry) => sum + entry.points,
      0
    );

    // Calculate remaining capacity
    const remainingEmails = Math.max(0, MAX_EMAILS_PER_DAY - emailsSentToday);
    const remainingPoints = Math.max(0, MAX_POINTS_PER_DAY - pointsFromEmailsToday);

    console.log('[Refer] Sending referral emails', {
      emailCount: emails.length,
      referralCode,
      videoId,
      referralUrl,
      referrerEmail: referrerEmail || '(not provided)',
      userId: user.id,
      emailsSentToday,
      pointsFromEmailsToday,
      remainingEmails,
      remainingPoints,
    });

    // Process each email sequentially to properly track remaining capacity
    const results: Array<{
      email: string;
      pointsAwarded: number;
      sent: boolean;
    }> = [];

    // Track running totals as we process emails
    let currentEmailsSent = emailsSentToday;
    let currentPointsAwarded = pointsFromEmailsToday;

    try {
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

        // Send email via Mailchimp Transactional
        await sendReferralEmail({
          toEmail: friendEmail,
          referralUrl,
          thumbnailUrl,
          videoLabel: videoConfig.label,
          referrerEmail,
          referrerName,
        });

        // Log referral invite
        await logReferralInvite({
          referralCode,
          friendEmail,
          videoId: videoConfig.id,
          channel: 'email',
        });

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
            }),
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
    } catch (error: any) {
      console.error('[Refer] Error sending emails:', error);
      return NextResponse.json(
        { error: 'Failed to send referral emails. Please try again.' },
        { status: 500 }
      );
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
  } catch (error: any) {
    console.error('[Refer] Error handling referral request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

