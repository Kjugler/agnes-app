import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildMissionaryEmail } from '@/lib/email/missionaryEmail';
import mailchimp from '@mailchimp/mailchimp_transactional';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://agnes-dev.ngrok-free.app';
const MAX_EMAILS_PER_RUN = 100;
const READ_DELAY = 15 * 24 * 60 * 60 * 1000; // 15 days

function getEmailClient() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    console.warn('[missionary-email] MAILCHIMP_TRANSACTIONAL_KEY missing');
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

    // Compute cutoff
    const cutoff = new Date(Date.now() - READ_DELAY);

    // 1. Find users who have at least one Purchase older than cutoff
    const usersFromPurchases = await prisma.user.findMany({
      where: {
        missionaryEmailSentAt: null,
        purchases: {
          some: {
            createdAt: {
              lte: cutoff,
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        referralCode: true,
      },
    });

    // 2. Find ReferralConversion rows older than cutoff and extract buyerEmail values
    const conversions = await prisma.referralConversion.findMany({
      where: {
        createdAt: {
          lte: cutoff,
        },
      },
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

    // 3. Find users whose email matches buyerEmail from ReferralConversion
    const usersFromConversions = buyerEmails.length > 0
      ? await prisma.user.findMany({
          where: {
            missionaryEmailSentAt: null,
            email: {
              in: buyerEmails,
            },
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            referralCode: true,
          },
        })
      : [];

    // 4. Merge and dedupe by user.id
    const userMap = new Map<string, typeof usersFromPurchases[0]>();

    for (const u of usersFromPurchases) {
      userMap.set(u.id, u);
    }
    for (const u of usersFromConversions) {
      if (!userMap.has(u.id)) {
        userMap.set(u.id, u);
      }
    }

    const users = Array.from(userMap.values()).slice(0, MAX_EMAILS_PER_RUN);

    // Log candidates
    console.log(
      '[missionary job candidates]',
      users.map((u) => ({ email: u.email }))
    );
    console.log(`[missionary-email] Found ${users.length} users to send emails to`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Build URLs
        const referUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const shareUrl = `${BASE_URL}/refer?code=${user.referralCode}`;
        const reviewUrl = `${BASE_URL}/journal`;
        const challengeUrl = `${BASE_URL}/contest`;
        const journalUrl = `${BASE_URL}/journal`;

        // Build email
        const { subject, html } = buildMissionaryEmail({
          firstName: user.firstName,
          referUrl,
          shareUrl,
          reviewUrl,
          challengeUrl,
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
            missionaryEmailSentAt: new Date(),
          },
        });

        sentCount++;
        console.log(`[missionary-email] Sent email to ${user.email}`);
      } catch (err: any) {
        const errorMsg = `Failed to send to ${user.email}: ${err?.message || 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[missionary-email] ${errorMsg}`, err);
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
    console.error('[missionary-email] Job error', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

