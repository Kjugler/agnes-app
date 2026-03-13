// Admin: Get, update, or delete signal

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(_req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const signal = await prisma.signal.findUnique({
      where: { id },
    });

    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, signal });
  } catch (err: unknown) {
    console.error('[admin/signals] Get error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body?.text === 'string' && body.text.trim().length >= 3) updates.text = body.text.trim();
    if (typeof body?.title === 'string') updates.title = body.title.trim() || null;
    if (typeof body?.type === 'string' && VALID_TYPES.includes(body.type as any)) updates.type = body.type;
    if (typeof body?.content === 'string') updates.content = body.content.trim() || null;
    if (typeof body?.mediaType === 'string' && VALID_MEDIA_TYPES.includes(body.mediaType as any)) updates.mediaType = body.mediaType;
    if (typeof body?.mediaUrl === 'string') updates.mediaUrl = body.mediaUrl.trim() || null;
    if (typeof body?.locationTag === 'string') updates.locationTag = body.locationTag.trim() || null;
    if (typeof body?.locationName === 'string') updates.locationName = body.locationName.trim() || null;
    if (typeof body?.locationLat === 'number') updates.locationLat = body.locationLat;
    if (typeof body?.locationLng === 'number') updates.locationLng = body.locationLng;
    if (Array.isArray(body?.tags) && body.tags.every((t: unknown) => typeof t === 'string')) updates.tags = body.tags;
    if (typeof body?.discussionEnabled === 'boolean') updates.discussionEnabled = body.discussionEnabled;
    if (body?.publishStatus === 'DRAFT' || body?.publishStatus === 'PUBLISHED') updates.publishStatus = body.publishStatus;
    if (body?.publishAt !== undefined) updates.publishAt = body.publishAt ? new Date(body.publishAt) : null;
    if (typeof body?.author === 'string') updates.author = body.author.trim() || null;

    const existing = await prisma.signal.findUnique({ where: { id }, select: { publishStatus: true } });
    const signal = await prisma.signal.update({
      where: { id },
      data: updates,
    });

    const newlyPublished =
      signal.publishStatus === 'PUBLISHED' &&
      (existing?.publishStatus === 'DRAFT' || existing?.publishStatus === null);
    if (newlyPublished) {
      await createSignalEvent(id);
    }

    return NextResponse.json({ ok: true, signal });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }
    console.error('[admin/signals] Update error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(_req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    await prisma.signal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }
    console.error('[admin/signals] Delete error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
