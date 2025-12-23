import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildNonParticipantReminderEmail } from '@/lib/email/nonParticipantReminder';
import mailchimp from '@mailchimp/mailchimp_transactional';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://agnes-dev.ngrok-free.app';
const MAX_EMAILS_PER_RUN = 100;
const TEST_MODE = false; // Group C: Production mode (2 days)
const CUTOFF_DELAY = TEST_MODE
  ? 10 * 1000
  : 2 * 24 * 60 * 60 * 1000; // 2 days

function getEmailClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[non-participant-reminder] MAILCHIMP_TRANSACTIONAL_KEY missing');
    return null;
  }
  return mailchimp(apiKey);
}

export async function GET(req: NextRequest) {
  try {
    const client = getEmailClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: 'Email service not configured' },
        { status: 500 }
      );
    }

    const fromEmail = process.env.MAILCHIMP_FROM_EMAIL;
    if (!fromEmail) {
      return NextResponse.json(
        { ok: false, error: 'MAILCHIMP_FROM_EMAIL not configured' },
        { status: 500 }
      );
    }

    // Find users who:
    // 1. HAVE joined the contest (contestJoinedAt is NOT null)
    // 2. Have zero points (points = 0)
    // 3. Have no Purchase records
    // 4. Are not in ReferralConversion buyerEmail list
    // 5. Have no posts
    // 6. Haven't received reminder email yet (nonParticipantEmailSentAt is null)
    // 7. Created at least CUTOFF_DELAY ago
    const cutoff = new Date(Date.now() - CUTOFF_DELAY);

    // Get all buyer emails from ReferralConversion to exclude
    const conversions = await prisma.referralConversion.findMany({
      select: {
        buyerEmail: true,
      },
    });

    const buyerEmails = Array.from(
      new Set(
        conversions
          .map((c) => c.buyerEmail)
          .filter((email): email is string => !!email)
      )
    );

    const users = await prisma.user.findMany({
      where: {
        nonParticipantEmailSentAt: null,
        contestJoinedAt: { not: null }, // MUST have joined contest
        points: 0, // MUST have zero points
        createdAt: {
          lte: cutoff,
        },
        purchases: {
          none: {}, // No purchases
        },
        posts: {
          none: {}, // No posts
        },
        // Must NOT be in ReferralConversion buyerEmail list
        ...(buyerEmails.length > 0
          ? {
              email: {
                notIn: buyerEmails,
              },
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        referralCode: true,
      },
      take: MAX_EMAILS_PER_RUN,
    });

    console.log(`[non-participant-reminder] Found ${users.length} users to send reminders to`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Build email
        const referUrl = user.referralCode
          ? `${BASE_URL}/refer?code=${user.referralCode}`
          : `${BASE_URL}/refer`;
        const { subject, html } = buildNonParticipantReminderEmail({
          firstName: user.firstName,
          challengeUrl: `${BASE_URL}/contest`,
          buyUrl: `${BASE_URL}/sample-chapters`,
          sampleUrl: `${BASE_URL}/sample-chapters`,
          shareUrl: referUrl,
        });

        // Apply global test contest banner
        const { applyGlobalEmailBanner } = await import('@/lib/emailBanner');
        const { html: htmlWithBanner } = applyGlobalEmailBanner({ html });

        // Send email via Mailchimp Transactional
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject,
            to: [{ email: user.email, type: 'to' }],
            html: htmlWithBanner,
            headers: {
              'Reply-To': fromEmail,
            },
          },
        });

        // Update user record
        await prisma.user.update({
          where: { id: user.id },
          data: {
            nonParticipantEmailSentAt: new Date(),
          },
        });

        sentCount++;
        console.log(`[non-participant-reminder] Sent reminder to ${user.email}`);
      } catch (err: any) {
        const errorMsg = `Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[non-participant-reminder] ${errorMsg}`, err);
        // Continue with next user even if one fails
      }
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      total: users.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[non-participant-reminder] Job error', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

