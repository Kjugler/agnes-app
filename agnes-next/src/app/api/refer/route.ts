import { NextRequest, NextResponse } from 'next/server';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';
import { logReferralInvite } from '@/lib/referrals/logReferralInvite';
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

    // Normalize referral code to uppercase for consistent lookup
    const normalizedReferralCode = referralCode.toUpperCase().trim();

    // Validate referral code by proxying to deepquill (canonical DB)
    // This ensures we check against the same database where users are created
    let user: { id: string; email: string; firstName: string | null; fname: string | null; lname: string | null } | null = null;
    
    try {
      // Proxy to deepquill's referral validation endpoint
      // Construct URL with query param for GET request
      const validateUrl = `/api/referral/validate?code=${encodeURIComponent(normalizedReferralCode)}`;
      const { data, status } = await proxyJson(validateUrl, req, {
        method: 'GET',
      });

      if (status === 200 && data?.valid && data?.userId) {
        // Code is valid - use the user data from deepquill
        user = {
          id: data.userId,
          email: data.email,
          firstName: data.firstName || null,
          fname: data.firstName || null,
          lname: data.lastName || null,
        };
        console.log('[Refer] Referral code validated via deepquill', {
          code: normalizedReferralCode,
          userId: user.id,
        });
      } else {
        console.warn('[Refer] Referral code validation failed', {
          code: normalizedReferralCode,
          status,
          data,
        });
      }
    } catch (proxyErr) {
      console.error('[Refer] Failed to validate via deepquill proxy', {
        error: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
        stack: proxyErr instanceof Error ? proxyErr.stack : undefined,
      });
    }

    if (!user) {
      console.warn('[Refer] Invalid referral code - not found in deepquill database', {
        referralCode: normalizedReferralCode,
      });
      return NextResponse.json(
        { error: 'Invalid referral code.' },
        { status: 400 }
      );
    }

    // Get referrer's full name for email personalization
    const referrerFirstName = user.firstName || user.fname || null;
    const referrerLastName = user.lname || null;

    console.log('[Refer] Sending referral emails', {
      emailCount: emails.length,
      referralCode: normalizedReferralCode,
      videoId,
      origin,
      referrerEmail: referrerEmail || '(not provided)',
      userId: user.id,
    });

    // Send emails via deepquill (secrets stay backend)
    let deepquillResult: { ok: boolean; sent: number; failed: number; errors?: Array<{ email: string; error: string }> } | null = null;
    
    try {
      const deepquillPath = '/api/refer-friend';
      console.log('[Refer] Proxying email send to deepquill', {
        deepquillUrl: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055'}${deepquillPath}`,
        emailCount: emails.length,
        referralCode,
        videoId,
        origin,
      });

      const { data, status } = await proxyJson(deepquillPath, req, {
        method: 'POST',
        body: {
          friendEmails: emails,
          referralCode,
          videoId,
          referrerEmail,
          referrerFirstName,
          referrerLastName,
          origin,
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

    // Log referral invites (non-blocking)
    for (const friendEmail of emails) {
      try {
        await logReferralInvite({
          referralCode: normalizedReferralCode,
          friendEmail,
          videoId,
          channel: 'email',
        });
      } catch (err: unknown) {
        console.warn('[Refer] Failed to log referral invite (non-blocking)', err);
      }
    }

    // Award points via deepquill (canonical DB)
    let pointsResult: {
      ok: boolean;
      pointsAwarded: number;
      daily: {
        emailsSentToday: number;
        pointsFromEmailsToday: number;
        maxEmailsPerDay: number;
        maxPointsPerDay: number;
      };
      results: Array<{
        email: string;
        pointsAwarded: number;
        sent: boolean;
      }>;
    } | null = null;

    try {
      const { data, status } = await proxyJson('/api/referral/award-email-points', req, {
        method: 'POST',
        body: {
          userId: user.id,
          friendEmails: emails,
        },
        headers: {
          'x-internal-proxy': process.env.INTERNAL_PROXY_SECRET || 'dev-only-secret',
        },
      });

      if (status === 200 && data?.ok) {
        pointsResult = data;
        console.log('[Refer] Points awarded via deepquill', {
          totalPointsAwarded: data.pointsAwarded,
          emailsSentToday: data.daily.emailsSentToday,
        });
      } else {
        console.error('[Refer] Failed to award points via deepquill', { status, data });
      }
    } catch (pointsErr) {
      console.error('[Refer] Error awarding points via deepquill', {
        error: pointsErr instanceof Error ? pointsErr.message : String(pointsErr),
      });
      // Don't fail the request - email was sent successfully
    }

    // Use points result if available, otherwise return success without points
    const totalPointsAwarded = pointsResult?.pointsAwarded || 0;
    const finalEmailsSentToday = pointsResult?.daily?.emailsSentToday || emails.length;
    const finalPointsFromEmailsToday = pointsResult?.daily?.pointsFromEmailsToday || 0;
    const maxEmailsPerDay = pointsResult?.daily?.maxEmailsPerDay || 20;
    const maxPointsPerDay = pointsResult?.daily?.maxPointsPerDay || 100;
    const results = pointsResult?.results || emails.map(email => ({
      email,
      pointsAwarded: 0,
      sent: true,
    }));

    return NextResponse.json({
      success: true,
      emailsSent: emails.length,
      pointsAwarded: totalPointsAwarded,
      daily: {
        emailsSentToday: finalEmailsSentToday,
        pointsFromEmailsToday: finalPointsFromEmailsToday,
        maxEmailsPerDay,
        maxPointsPerDay,
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

