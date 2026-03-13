import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commentId = body?.commentId;

    if (typeof commentId !== 'string' || !commentId) {
      return NextResponse.json({ ok: false, error: 'commentId is required' }, { status: 400 });
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

    const comment = await prisma.signalComment.findUnique({
      where: { id: commentId },
      include: {
        upvoteRecords: { where: { userId: user.id }, select: { id: true } },
      },
    });

    if (!comment) {
      return NextResponse.json({ ok: false, error: 'Comment not found' }, { status: 404 });
    }

    const existing = comment.upvoteRecords[0];

    if (existing) {
      await prisma.$transaction([
        prisma.signalCommentUpvote.delete({ where: { id: existing.id } }),
        prisma.signalComment.update({
          where: { id: commentId },
          data: { upvotes: Math.max(0, comment.upvotes - 1) },
        }),
      ]);
      return NextResponse.json({ ok: true, upvoted: false });
    }

    await prisma.$transaction([
      prisma.signalCommentUpvote.create({
        data: { commentId, userId: user.id },
      }),
      prisma.signalComment.update({
        where: { id: commentId },
        data: { upvotes: comment.upvotes + 1 },
      }),
    ]);

    return NextResponse.json({ ok: true, upvoted: true });
  } catch (err: unknown) {
    console.error('[signal/comment-upvote] Error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
