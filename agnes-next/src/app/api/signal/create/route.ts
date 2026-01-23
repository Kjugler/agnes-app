import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';
import { getEntryVariant, logEntryVariant } from '@/lib/entryVariant';

const PROFANITY_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'faggot'];

function containsLink(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('www.') ||
    lower.includes('.com') ||
    lower.includes('@')
  );
}

function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY_WORDS.some((word) => {
    // Simple word boundary check
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}

export async function POST(req: NextRequest) {
  try {
    // Parse and validate text
    const body = await req.json();
    const textRaw = body?.text;

    if (typeof textRaw !== 'string') {
      return NextResponse.json({ ok: false, error: 'text must be a string' }, { status: 400 });
    }

    const text = textRaw.trim();

    if (text.length < 3) {
      return NextResponse.json({ ok: false, error: 'text must be at least 3 characters' }, { status: 400 });
    }

    if (text.length > 240) {
      return NextResponse.json({ ok: false, error: 'text must be at most 240 characters' }, { status: 400 });
    }

    // Identify user from cookies/headers
    const headerEmail = req.headers.get('x-user-email');
    const cookieEmail =
      req.cookies.get('contest_email')?.value ||
      req.cookies.get('mockEmail')?.value ||
      req.cookies.get('user_email')?.value ||
      req.cookies.get('associate_email')?.value ||
      null;

    const emailRaw = cookieEmail || headerEmail;

    if (!emailRaw) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const email = normalizeEmail(emailRaw);

    // Ensure user exists
    const user = await ensureAssociateMinimal(email);

    // Check if user has purchase
    const purchaseCount = await prisma.purchase.count({
      where: { userId: user.id },
    });

    // Check ReferralConversion for buyer email
    const conversions = await prisma.referralConversion.findMany({
      where: {
        buyerEmail: email,
      },
      select: { id: true },
    });

    const hasPurchase = purchaseCount > 0 || conversions.length > 0;

    // Check if user is contest official (points >= 250)
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { points: true },
    });

    const isContestOfficial = (userRecord?.points || 0) >= 250;

    // Moderation logic
    const hasLink = containsLink(text);
    const hasProfanity = containsProfanity(text);

    // Determine status
    type SignalStatusLocal = 'APPROVED' | 'HELD' | 'REJECTED';
    type SignalHeldReasonLocal = 'PROFANITY' | 'HARASSMENT' | 'HATE' | 'LINK' | null;
    let status: SignalStatusLocal = 'HELD';
    let heldReason: SignalHeldReasonLocal = null;

    // Default status based on purchase/official status
    if (hasPurchase || isContestOfficial) {
      status = 'APPROVED';
    }

    // Force hold for links or profanity
    if (hasLink) {
      status = 'HELD';
      heldReason = 'LINK';
    } else if (hasProfanity) {
      status = 'HELD';
      heldReason = 'PROFANITY';
    }

    // 1.1: AUTO_APPROVE in dev mode (DEV ONLY)
    const AUTO_APPROVE = process.env.NODE_ENV === 'development' && process.env.AUTO_APPROVE_USER_CONTENT === 'true';
    if (AUTO_APPROVE && status === 'HELD') {
      // Override held status to approved in dev mode
      status = 'APPROVED';
      heldReason = null;
      console.log('[signal/create] AUTO_APPROVE enabled - approving signal in dev mode');
    }

    // Get geo from headers (Vercel provides these)
    const countryCode = req.headers.get('x-vercel-ip-country') || null;
    const region = req.headers.get('x-vercel-ip-country-region') || null;

    // Create signal
    const signal = await prisma.signal.create({
      data: {
        text,
        status,
        heldReason,
        isSystem: false,
        userId: user.id,
        countryCode,
        region,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        heldAt: status === 'HELD' ? new Date() : null,
      },
    });

    // Log entry variant for analytics
    const variant = getEntryVariant(req);
    logEntryVariant('signal_created', variant, {
      signalId: signal.id,
      status,
      userId: user.id,
    });

    // 1.2: Auto-award points if approved (DEV ONLY with AUTO_APPROVE)
    if (AUTO_APPROVE && status === 'APPROVED' && signal.userId) {
      try {
        const deepquillUrl = process.env.DEEPQUILL_URL || 'http://localhost:5055';
        const awardResponse = await fetch(`${deepquillUrl}/api/points/award`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'signal_approved',
            userId: signal.userId,
            signalId: signal.id,
          }),
        });

        if (awardResponse.ok) {
          const awardData = await awardResponse.json();
          console.log('[signal/create] ✅ Points auto-awarded (AUTO_APPROVE)', {
            signalId: signal.id,
            awarded: awardData.awarded,
          });
        } else {
          console.warn('[signal/create] Failed to auto-award points', {
            signalId: signal.id,
            status: awardResponse.status,
          });
        }
      } catch (err: any) {
        console.error('[signal/create] Error auto-awarding points', {
          signalId: signal.id,
          error: err.message,
        });
        // Don't fail signal creation if points fail
      }
    }

    return NextResponse.json({
      ok: true,
      status: status,
      signalId: signal.id,
    });
  } catch (err: any) {
    console.error('[signal/create] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

