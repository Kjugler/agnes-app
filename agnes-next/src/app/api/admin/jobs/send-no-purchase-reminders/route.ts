import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildNoPurchaseReminderEmail } from '@/lib/email/noPurchaseReminder';
import mailchimp from '@mailchimp/mailchimp_transactional';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://agnes-dev.ngrok-free.app';
const MAX_EMAILS_PER_RUN = 100;

function getEmailClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[no-purchase-reminder] MAILCHIMP_TRANSACTIONAL_KEY missing');
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
    // 1. Haven't purchased (no Purchase records)
    // 2. Haven't received reminder email yet (noPurchaseEmailSentAt is null)
    // 3. Entered contest at least 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: {
        noPurchaseEmailSentAt: null,
        createdAt: {
          lte: twentyFourHoursAgo,
        },
        purchases: {
          none: {}, // No purchases
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        referralCode: true,
      },
      take: MAX_EMAILS_PER_RUN,
    });

    console.log(`[no-purchase-reminder] Found ${users.length} users to send reminders to`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Build personal share URL
        const shareUrl = `${BASE_URL}/refer?code=${user.referralCode}`;

        // Build email
        const { subject, html } = buildNoPurchaseReminderEmail({
          firstName: user.firstName,
          buyUrl: `${BASE_URL}/sample-chapters`, // Buy page
          referUrl: `${BASE_URL}/refer`,
          shareUrl,
          journalUrl: `${BASE_URL}/journal`, // Placeholder
        });

        // Send email via Mailchimp Transactional
        await client.messages.send({
          message: {
            from_email: fromEmail,
            subject,
            to: [{ email: user.email, type: 'to' }],
            html,
            headers: {
              'Reply-To': fromEmail,
            },
          },
        });

        // Update user record
        await prisma.user.update({
          where: { id: user.id },
          data: {
            noPurchaseEmailSentAt: new Date(),
          },
        });

        sentCount++;
        console.log(`[no-purchase-reminder] Sent reminder to ${user.email}`);
      } catch (err: any) {
        const errorMsg = `Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[no-purchase-reminder] ${errorMsg}`, err);
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
    console.error('[no-purchase-reminder] Job error', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

