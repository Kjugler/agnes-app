import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const type = searchParams.get('type'); // optional filter

    const where = {
      status: 'APPROVED' as const,
      OR: [{ publishStatus: 'PUBLISHED' }, { publishStatus: null }],
      ...(type && type !== 'all' ? { type: type as any } : {}),
    };

    const signals = await prisma.signal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        text: true,
        title: true,
        type: true,
        content: true,
        mediaType: true,
        mediaUrl: true,
        locationTag: true,
        tags: true,
        discussionEnabled: true,
        isSystem: true,
        createdAt: true,
        author: true,
        user: { select: { email: true, firstName: true } },
        _count: { select: { replies: true, acknowledges: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { email: true, firstName: true } } },
        },
      },
    });

    const hasMore = signals.length > limit;
    const items = hasMore ? signals.slice(0, limit) : signals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const signalsData = items.map((s) => ({
      id: s.id,
      text: s.text,
      title: s.title ?? null,
      type: s.type ?? null,
      content: s.content ?? null,
      mediaType: s.mediaType ?? null,
      mediaUrl: s.mediaUrl ?? null,
      locationTag: s.locationTag ?? null,
      tags: s.tags ?? null,
      discussionEnabled: s.discussionEnabled ?? true,
      isSystem: s.isSystem,
      createdAt: s.createdAt,
      userEmail: s.user?.email ?? null,
      userFirstName: s.user?.firstName ?? null,
      replyCount: s._count.replies,
      acknowledgeCount: s._count.acknowledges,
      acknowledged: false, // client will need to pass userId for this
      replies: s.replies.map((r) => ({
        id: r.id,
        text: r.text,
        createdAt: r.createdAt,
        userEmail: r.user?.email ?? null,
        userFirstName: r.user?.firstName ?? null,
      })),
    }));

    return NextResponse.json({
      ok: true,
      signals: signalsData,
      nextCursor,
      hasMore,
    });
  } catch (err: unknown) {
    console.error('[signals] Error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
