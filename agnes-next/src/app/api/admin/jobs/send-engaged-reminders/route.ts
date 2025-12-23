import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildEngagedReminderEmail } from '@/lib/email/engagedReminder';
import mailchimp from '@mailchimp/mailchimp_transactional';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://agnes-dev.ngrok-free.app';
const MAX_EMAILS_PER_RUN = 100;
const TEST_MODE = false; // Group B: Production mode (2 days)
const CUTOFF_DELAY = TEST_MODE
  ? 10 * 1000
  : 2 * 24 * 60 * 60 * 1000; // 2 days

function getEmailClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[engaged-reminder] MAILCHIMP_TRANSACTIONAL_KEY missing');
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

    // Compute 24-hour cutoff (or 10 seconds for testing)
    const CUTOFF = new Date(Date.now() - CUTOFF_DELAY);

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

    // Find users who:
    // 1. Have engagement (contestJoinedAt OR posts OR events)
    // 2. Have no Purchase records
    // 3. Are not in ReferralConversion buyerEmail list
    // 4. Haven't received this email yet (engagedEmailSentAt is null)
    // 5. Were created at least 24 hours ago (or 10 seconds for testing)
    const users = await prisma.user.findMany({
      where: {
        engagedEmailSentAt: null,
        createdAt: {
          lte: CUTOFF,
        },
        // Must have engagement
        OR: [
          { contestJoinedAt: { not: null } },
          { posts: { some: {} } },
          { events: { some: {} } },
        ],
        // Must NOT have purchases
        purchases: {
          none: {},
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

    console.log(
      '[engaged-reminder candidates]',
      users.map((u) => ({ email: u.email }))
    );
    console.log(`[engaged-reminder] Found ${users.length} users to send emails to`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Ensure user has a referralCode before proceeding
        if (!user.referralCode) {
          console.warn(`[engaged-reminder] Skipping user ${user.email}: no referralCode found`);
          continue;
        }

        // Build URLs
        const buyUrl = `${BASE_URL}/sample-chapters`;
        const challengeUrl = `${BASE_URL}/contest`;
        const shareUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const journalUrl = `${BASE_URL}/journal`;

        // Build email
        const { subject, html } = buildEngagedReminderEmail({
          firstName: user.firstName,
          buyUrl,
          challengeUrl,
          shareUrl,
          journalUrl,
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
            engagedEmailSentAt: new Date(),
          },
        });

        sentCount++;
        console.log(`[engaged-reminder] Sent email to ${user.email}`);
      } catch (err: any) {
        const errorMsg = `Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[engaged-reminder] ${errorMsg}`, err);
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
    console.error('[engaged-reminder] Job error', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

