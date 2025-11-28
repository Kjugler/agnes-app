import { NextRequest, NextResponse } from 'next/server';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';
import { sendReferralEmail } from '@/lib/email/sendReferralEmail';
import { logReferralInvite } from '@/lib/referrals/logReferralInvite';

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

    // Base URL and thumbnail URL
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    const referralUrl = `${baseUrl}/refer?code=${encodeURIComponent(
      referralCode
    )}&v=${videoConfig.id}&src=email`;

    const thumbnailUrl = `${baseUrl}${videoConfig.thumbnailSrc}`;

    // Get referrer email (optional, for Reply-To)
    const referrerEmail =
      typeof body.referrerEmail === 'string' ? body.referrerEmail.trim() : undefined;

    console.log('[Refer] Sending referral emails', {
      emailCount: emails.length,
      referralCode,
      videoId,
      referralUrl,
      referrerEmail: referrerEmail || '(not provided)',
    });

    // Send to all recipients in parallel
    try {
      await Promise.all(
        emails.map(async (friendEmail: string) => {
          await sendReferralEmail({
            friendEmail,
            referrerCode: referralCode,
            referralUrl,
            videoId: videoConfig.id,
            videoLabel: videoConfig.label,
            thumbnailUrl,
            referrerEmail, // new
          });

          // Fire-and-forget logging (can be awaited if you prefer)
          await logReferralInvite({
            referralCode,
            friendEmail,
            videoId: videoConfig.id,
            channel: 'email',
          });
        })
      );
    } catch (error: any) {
      console.error('[Refer] Error sending emails:', error);
      return NextResponse.json(
        { error: 'Failed to send referral emails. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Refer] Error handling referral request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

