import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SignalStatus, SignalHeldReason } from '@prisma/client';
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
    let status: SignalStatus = SignalStatus.HELD;
    let heldReason: SignalHeldReason | null = null;

    // Default status based on purchase/official status
    if (hasPurchase || isContestOfficial) {
      status = SignalStatus.APPROVED;
    }

    // Force hold for links or profanity
    if (hasLink) {
      status = SignalStatus.HELD;
      heldReason = SignalHeldReason.LINK;
    } else if (hasProfanity) {
      status = SignalStatus.HELD;
      heldReason = SignalHeldReason.PROFANITY;
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
        approvedAt: status === SignalStatus.APPROVED ? new Date() : null,
        heldAt: status === SignalStatus.HELD ? new Date() : null,
      },
    });

    // Log entry variant for analytics
    const variant = getEntryVariant(req);
    logEntryVariant('signal_created', variant, {
      signalId: signal.id,
      status,
      userId: user.id,
    });

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

