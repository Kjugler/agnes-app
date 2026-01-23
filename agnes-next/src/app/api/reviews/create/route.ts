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
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ratingRaw = body?.rating;
    const textRaw = body?.text;
    const tagsRaw = body?.tags;

    // Validate rating
    const rating = typeof ratingRaw === 'number' ? Math.round(ratingRaw) : Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: 'rating must be 1-5' }, { status: 400 });
    }

    // Validate text
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

    // Validate tags (optional, max 5)
    let tags: string | null = null;
    if (tagsRaw) {
      if (Array.isArray(tagsRaw) && tagsRaw.length > 0 && tagsRaw.length <= 5) {
        tags = JSON.stringify(tagsRaw.slice(0, 5));
      } else {
        return NextResponse.json({ ok: false, error: 'tags must be an array with 1-5 items' }, { status: 400 });
      }
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
    let status: 'APPROVED' | 'HELD' | 'REJECTED' = 'HELD';
    let heldReason: 'PROFANITY' | 'HARASSMENT' | 'HATE' | 'LINK' | null = null;

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
      console.log('[reviews/create] AUTO_APPROVE enabled - approving review in dev mode');
    }

    // Get geo from headers (Vercel provides these)
    const countryCode = req.headers.get('x-vercel-ip-country') || null;
    const region = req.headers.get('x-vercel-ip-country-region') || null;

    // Upsert review (one per user)
    const review = await prisma.review.upsert({
      where: { userId: user.id },
      update: {
        rating,
        text,
        tags,
        status,
        heldReason,
        countryCode,
        region,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        heldAt: status === 'HELD' ? new Date() : null,
      },
      create: {
        userId: user.id,
        rating,
        text,
        tags,
        status,
        heldReason,
        countryCode,
        region,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        heldAt: status === 'HELD' ? new Date() : null,
      },
    });

    // Dev-only: Log DB connection info for debugging
    if (process.env.NODE_ENV === 'development') {
      const dbUrl = process.env.DATABASE_URL || '';
      const dbInfo = dbUrl.includes('file:')
        ? `SQLite: ${dbUrl.split('/').pop() || 'unknown'}`
        : dbUrl.length > 20
        ? `...${dbUrl.slice(-20)}`
        : dbUrl;
      console.log('[reviews/create] DB connection:', dbInfo);
    }

    // Log entry variant for analytics
    const variant = getEntryVariant(req);
    logEntryVariant('review_created', variant, {
      reviewId: review.id,
      status,
      rating,
      userId: user.id,
    });

    // 1.2: Auto-award points if approved (DEV ONLY with AUTO_APPROVE)
    if (AUTO_APPROVE && status === 'APPROVED' && review.userId) {
      try {
        const deepquillUrl = process.env.DEEPQUILL_URL || 'http://localhost:5055';
        const awardResponse = await fetch(`${deepquillUrl}/api/points/award`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'review_approved',
            userId: review.userId,
            reviewId: review.id,
          }),
        });

        if (awardResponse.ok) {
          const awardData = await awardResponse.json();
          console.log('[reviews/create] ✅ Points auto-awarded (AUTO_APPROVE)', {
            reviewId: review.id,
            awarded: awardData.awarded,
          });
        } else {
          console.warn('[reviews/create] Failed to auto-award points', {
            reviewId: review.id,
            status: awardResponse.status,
          });
        }
      } catch (err: any) {
        console.error('[reviews/create] Error auto-awarding points', {
          reviewId: review.id,
          error: err.message,
        });
        // Don't fail review creation if points fail
      }
    }

    return NextResponse.json({
      ok: true,
      status: status,
      reviewId: review.id,
    });
  } catch (err: any) {
    console.error('[reviews/create] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

