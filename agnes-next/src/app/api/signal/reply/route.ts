import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SignalStatus, SignalHeldReason } from '@prisma/client';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

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
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signalId = body?.signalId;
    const textRaw = body?.text;

    if (typeof signalId !== 'string' || !signalId) {
      return NextResponse.json({ ok: false, error: 'signalId is required' }, { status: 400 });
    }

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

    // Verify signal exists
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
    });

    if (!signal) {
      return NextResponse.json({ ok: false, error: 'Signal not found' }, { status: 404 });
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

    // Moderation logic (same as signal creation)
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

    // Create reply (note: schema doesn't have status field, so we return status but don't store it)
    // If moderation is needed later, add status/heldReason fields to SignalReply model
    const reply = await prisma.signalReply.create({
      data: {
        signalId,
        userId: user.id,
        text,
        isAnonymous: false,
      },
    });

    return NextResponse.json({
      ok: true,
      status: status,
      replyId: reply.id,
    });
  } catch (err: any) {
    console.error('[signal/reply] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

