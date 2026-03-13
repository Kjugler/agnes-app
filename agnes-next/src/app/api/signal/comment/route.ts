import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

const PROFANITY_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'faggot'];
const SPAM_KEYWORDS = ['buy now', 'click here', 'free money', 'winner', 'congratulations', 'act now'];

function containsLink(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('www.') ||
    lower.includes('.com') ||
    lower.includes('.org') ||
    lower.includes('.net')
  );
}

function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY_WORDS.some((word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}

function containsSpam(text: string): boolean {
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signalId = body?.signalId;
    const commentTextRaw = body?.commentText;

    if (typeof signalId !== 'string' || !signalId) {
      return NextResponse.json({ ok: false, error: 'signalId is required' }, { status: 400 });
    }

    if (typeof commentTextRaw !== 'string') {
      return NextResponse.json({ ok: false, error: 'commentText must be a string' }, { status: 400 });
    }

    const commentText = commentTextRaw.trim();

    if (commentText.length < 3) {
      return NextResponse.json({ ok: false, error: 'Comment must be at least 3 characters' }, { status: 400 });
    }

    if (commentText.length > 500) {
      return NextResponse.json({ ok: false, error: 'Comment must be at most 500 characters' }, { status: 400 });
    }

    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      select: { id: true, discussionEnabled: true },
    });

    if (!signal) {
      return NextResponse.json({ ok: false, error: 'Signal not found' }, { status: 404 });
    }

    if (!signal.discussionEnabled) {
      return NextResponse.json({ ok: false, error: 'Discussion is disabled for this signal' }, { status: 403 });
    }

    const cookieEmail =
      req.cookies.get('contest_email')?.value ||
      req.cookies.get('mockEmail')?.value ||
      req.cookies.get('user_email')?.value ||
      req.cookies.get('associate_email')?.value ||
      null;

    if (!cookieEmail) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const email = normalizeEmail(cookieEmail);
    const user = await ensureAssociateMinimal(email);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.signalComment.count({
      where: {
        signalId,
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentCount >= 3) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit: max 3 comments per signal per hour' },
        { status: 429 }
      );
    }

    const hasLink = containsLink(commentText);
    const hasProfanity = containsProfanity(commentText);
    const hasSpam = containsSpam(commentText);
    const isFlagged = hasLink || hasProfanity || hasSpam;
    const flagReason = hasLink ? 'LINK' : hasProfanity ? 'PROFANITY' : hasSpam ? 'SPAM' : null;

    const comment = await prisma.signalComment.create({
      data: {
        signalId,
        userId: user.id,
        commentText,
        isFlagged: !!isFlagged,
        flagReason: flagReason || undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      commentId: comment.id,
      isFlagged,
    });
  } catch (err: unknown) {
    console.error('[signal/comment] Error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
