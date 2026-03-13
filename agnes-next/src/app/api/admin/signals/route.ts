// Admin: Create signal (full control)
// Auth: dev allows all; prod requires x-admin-key

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSignalEvent } from '@/lib/signalEvent';

const VALID_TYPES = ['ARCHIVE', 'LOCATION', 'VISUAL', 'NARRATIVE', 'PLAYER_QUESTION', 'PODCASTER_PROMPT', 'SPECULATIVE'] as const;
const VALID_MEDIA_TYPES = ['image', 'video', 'map', 'document', 'audio', 'none'] as const;

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers.get('x-admin-key');
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const title = typeof body?.title === 'string' ? body.title.trim() || null : null;
    const type = typeof body?.type === 'string' && VALID_TYPES.includes(body.type as any) ? body.type : null;
    const content = typeof body?.content === 'string' ? body.content.trim() || null : null;
    const mediaType = typeof body?.mediaType === 'string' && VALID_MEDIA_TYPES.includes(body.mediaType as any) ? body.mediaType : null;
    const mediaUrl = typeof body?.mediaUrl === 'string' ? body.mediaUrl.trim() || null : null;
    const locationTag = typeof body?.locationTag === 'string' ? body.locationTag.trim() || null : null;
    const locationName = typeof body?.locationName === 'string' ? body.locationName.trim() || null : null;
    const locationLat = typeof body?.locationLat === 'number' ? body.locationLat : null;
    const locationLng = typeof body?.locationLng === 'number' ? body.locationLng : null;
    const tags = Array.isArray(body?.tags) && body.tags.every((t: unknown) => typeof t === 'string') ? body.tags : null;
    const discussionEnabled = typeof body?.discussionEnabled === 'boolean' ? body.discussionEnabled : true;
    const publishStatus = body?.publishStatus === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    const publishAt = body?.publishAt ? new Date(body.publishAt) : null;
    const author = typeof body?.author === 'string' ? body.author.trim() || null : null;

    if (text.length < 3) {
      return NextResponse.json({ error: 'text must be at least 3 characters' }, { status: 400 });
    }

    const signal = await prisma.signal.create({
      data: {
        text,
        title: title ?? undefined,
        type: type ?? undefined,
        content: content ?? undefined,
        mediaType: mediaUrl ? (mediaType ?? 'image') : undefined,
        mediaUrl: mediaUrl ?? undefined,
        locationTag: locationTag ?? undefined,
        locationName: locationName ?? undefined,
        locationLat: locationLat ?? undefined,
        locationLng: locationLng ?? undefined,
        tags: tags ?? undefined,
        discussionEnabled,
        publishStatus,
        publishAt: publishAt ?? undefined,
        author: author ?? undefined,
        isSystem: true,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });

    if (publishStatus === 'PUBLISHED' && !publishAt) {
      await createSignalEvent(signal.id);
    }

    return NextResponse.json({ ok: true, signalId: signal.id, signal });
  } catch (err: unknown) {
    console.error('[admin/signals] Create error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const signals = await prisma.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { comments: true, replies: true } },
      },
    });

    return NextResponse.json({ ok: true, signals });
  } catch (err: unknown) {
    console.error('[admin/signals] List error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
