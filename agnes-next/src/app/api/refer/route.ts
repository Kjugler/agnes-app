import { NextRequest, NextResponse } from 'next/server';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';
import { proxyJson } from '@/lib/deepquillProxy';
import { logReferralInvite } from '@/lib/referrals/logReferralInvite';
import { prisma } from '@/lib/db';
import { startOfToday } from '@/lib/dailySharePoints';
import { getSiteUrl } from '@/lib/getSiteUrl';

type ReferRequestBody = {
  friendEmails: string[]; // REQUIRED, non-empty
  videoId: ReferVideoId;
  referralCode: string;
  referrerEmail?: string; // Optional, for Reply-To
};

export async function POST(req: NextRequest) {
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

    // Build base referral URL using canonical getSiteUrl() helper
    // Note: Each email will get its own URL with toEmail parameter added
    let siteUrlResult;
    try {
      siteUrlResult = getSiteUrl();
      if (!siteUrlResult?.url) {
        throw new Error('getSiteUrl() returned invalid result');
      }
    } catch (urlErr: any) {
      console.error('[Refer] Failed to get site URL', {
        error: urlErr?.message,
        stack: urlErr?.stack,
      });
      return NextResponse.json(
        { error: 'Failed to build referral URL. Please try again.' },
        { status: 500 }
      );
    }

    // Build thumbnail URL using siteUrl (with error handling)
    let thumbnailUrl: string;
    try {
      const thumbnailUrlObj = new URL(videoConfig.thumbnailSrc, siteUrlResult.url);
      thumbnailUrl = thumbnailUrlObj.toString();
    } catch (thumbErr: any) {
      console.error('[Refer] Failed to build thumbnail URL', {
        error: thumbErr?.message,
        thumbnailSrc: videoConfig.thumbnailSrc,
        baseUrl: siteUrlResult.url,
      });
      // Fallback: use thumbnailSrc as-is if URL construction fails
      thumbnailUrl = videoConfig.thumbnailSrc;
    }

    // Helper function to build referral URL with toEmail parameter
    // Wrapped in try-catch to handle URL construction errors gracefully
    const buildReferralUrl = (toEmail: string): string => {
      try {
        const referralUrlObj = new URL('/refer', siteUrlResult.url);
        referralUrlObj.searchParams.set('code', referralCode);
        referralUrlObj.searchParams.set('v', videoConfig.id);
        referralUrlObj.searchParams.set('src', 'email');
        referralUrlObj.searchParams.set('toEmail', toEmail); // Add recipient email for identity mismatch detection
        return referralUrlObj.toString();
      } catch (urlErr: any) {
        console.error('[Refer] Failed to build referral URL', {
          error: urlErr?.message,
          baseUrl: siteUrlResult.url,
          toEmail,
        });
        // Fallback: build URL without toEmail if construction fails
        return `${siteUrlResult.url}/refer?code=${encodeURIComponent(referralCode)}&v=${videoConfig.id}&src=email`;
      }
    };

    // Dev-only logging: resolved base URL + source
    if (process.env.NODE_ENV === 'development') {
      console.log('[Refer] Resolved base URL for referral email', {
        baseUrl: siteUrlResult.url,
        source: siteUrlResult.source,
      });
    }

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

    // Daily referral limits disabled (Ledger removed)
    const emailsSentToday = 0;
    const pointsFromEmailsToday = 0;

    // Calculate remaining capacity
    const remainingEmails = Math.max(0, MAX_EMAILS_PER_DAY - emailsSentToday);
    const remainingPoints = Math.max(0, MAX_POINTS_PER_DAY - pointsFromEmailsToday);

    console.log('[Refer] Sending referral emails', {
      emailCount: emails.length,
      referralCode,
      videoId,
      baseUrl: siteUrlResult.url,
      referrerEmail: referrerEmail || '(not provided)',
      userId: user.id,
      emailsSentToday,
      pointsFromEmailsToday,
      remainingEmails,
      remainingPoints,
    });

    // Process each email sequentially to properly track remaining capacity
    // Each email is processed independently - one failure doesn't stop others
    const results: Array<{
      email: string;
      pointsAwarded: number;
      sent: boolean;
      error?: string; // Track errors per email
    }> = [];

    // Track running totals as we process emails
    let currentEmailsSent = emailsSentToday;
    let currentPointsAwarded = pointsFromEmailsToday;

    // Process emails sequentially (not in parallel) to correctly track caps
    // Each email is wrapped in try-catch so one bad address doesn't fail the whole request
    for (const friendEmail of emails) {
      try {
        // Check if we're still under caps
        const eligibleForPoints =
          currentEmailsSent < MAX_EMAILS_PER_DAY &&
          currentPointsAwarded < MAX_POINTS_PER_DAY;
        
        let pointsForThisEmail = 0;
        if (eligibleForPoints) {
          const pointsRemaining = MAX_POINTS_PER_DAY - currentPointsAwarded;
          pointsForThisEmail = Math.min(POINTS_PER_EMAIL, pointsRemaining);
        }

        // Build referral URL with this friend's email included
        const referralUrlForFriend = buildReferralUrl(friendEmail);

        // Send email via deepquill (proxied to keep Mailchimp credentials in deepquill)
        // This is the critical operation - if it fails, mark email as failed but continue
        let emailSent = false;
        try {
          await proxyJson('/api/referral-email', req, {
            method: 'POST',
            body: {
              toEmail: friendEmail,
              referralUrl: referralUrlForFriend, // Each email gets its own URL with toEmail param
              thumbnailUrl,
              videoLabel: videoConfig.label,
              referrerEmail,
              referrerName,
            },
          });
          emailSent = true;
          console.log('[Refer] Referral email sent via deepquill proxy', {
            toEmail: friendEmail,
            referralUrl: referralUrlForFriend,
          });
        } catch (emailErr: any) {
          console.error('[Refer] Failed to send referral email via deepquill proxy', {
            error: emailErr?.message,
            toEmail: friendEmail,
            stack: emailErr?.stack,
          });
          // Mark as failed but continue processing other emails
          results.push({
            email: friendEmail,
            pointsAwarded: 0,
            sent: false,
            error: emailErr?.message || 'Email send failed',
          });
          continue; // Skip to next email
        }

        // Log referral invite (non-blocking - don't fail request if logging fails)
        try {
          await logReferralInvite({
            referralCode,
            friendEmail,
            videoId: videoConfig.id,
            channel: 'email',
          });
        } catch (logErr: any) {
          console.warn('[Refer] Failed to log referral invite (non-blocking)', {
            error: logErr?.message,
            friendEmail,
          });
          // Continue - logging failure shouldn't block email send
        }

        // Award points if eligible (Ledger removed - just update user points)
        // Wrap in try-catch so Prisma errors don't fail the entire request
        if (pointsForThisEmail > 0) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { points: { increment: pointsForThisEmail } },
            });
            currentPointsAwarded += pointsForThisEmail;
            console.log('[POINTS] Awarded', pointsForThisEmail, 'points for refer_email to', friendEmail, {
              userId: user.id,
              totalPointsAfter: currentPointsAwarded,
            });
          } catch (pointsErr: any) {
            console.error('[Refer] Failed to award points (non-blocking)', {
              error: pointsErr?.message,
              userId: user.id,
              friendEmail,
              pointsAttempted: pointsForThisEmail,
            });
            // Continue - points failure shouldn't block email send
            // Still mark email as sent in results
          }
        } else {
          console.log('[POINTS] Referral email sent but no points awarded (daily cap reached)', {
            userId: user.id,
            friendEmail,
            emailsSentToday: currentEmailsSent,
            pointsFromEmailsToday: currentPointsAwarded,
          });
        }

        currentEmailsSent += 1;

        // Track result (email was sent successfully, even if points/logging failed)
        results.push({
          email: friendEmail,
          pointsAwarded: pointsForThisEmail, // May be 0 if points update failed
          sent: true, // Email was sent successfully
        });
      } catch (emailProcessingErr: any) {
        // Catch any unexpected errors during email processing
        // This ensures one bad email doesn't stop the entire request
        console.error('[Refer] Unexpected error processing email', {
          error: emailProcessingErr?.message,
          stack: emailProcessingErr?.stack,
          email: friendEmail,
        });
        results.push({
          email: friendEmail,
          pointsAwarded: 0,
          sent: false,
          error: emailProcessingErr?.message || 'Unexpected error',
        });
        // Continue to next email
      }
    }

    // Calculate final totals (use tracked values)
    const successfulEmails = results.filter(r => r.sent).length;
    const failedEmails = results.filter(r => !r.sent).length;
    const totalPointsAwarded = results.reduce((sum, r) => sum + r.pointsAwarded, 0);
    const finalEmailsSentToday = currentEmailsSent;
    const finalPointsFromEmailsToday = currentPointsAwarded;

    // Return success if at least one email was sent, or if all emails were attempted
    // This allows partial success (some emails sent, some failed)
    const hasAnySuccess = successfulEmails > 0;
    
    return NextResponse.json({
      success: hasAnySuccess,
      emailsSent: successfulEmails,
      emailsFailed: failedEmails,
      emailsTotal: emails.length,
      pointsAwarded: totalPointsAwarded,
      daily: {
        emailsSentToday: finalEmailsSentToday,
        pointsFromEmailsToday: finalPointsFromEmailsToday,
        maxEmailsPerDay: MAX_EMAILS_PER_DAY,
        maxPointsPerDay: MAX_POINTS_PER_DAY,
      },
      results, // Includes per-email success/failure details
    });
  } catch (error: any) {
    console.error('[Refer] Error handling referral request:', {
      error: error?.message,
      stack: error?.stack,
      name: error?.name,
      // Include request context for debugging
      hasBody: !!req.body,
      method: req.method,
    });
    return NextResponse.json(
      { 
        error: 'Internal server error',
        // Include error message in dev mode for easier debugging
        ...(process.env.NODE_ENV === 'development' && error?.message ? { details: error.message } : {}),
      },
      { status: 500 }
    );
  }
}

