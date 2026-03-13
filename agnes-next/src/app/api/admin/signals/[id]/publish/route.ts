// Admin: Publish a signal (set PUBLISHED, create SignalEvent for ribbon)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSignalEvent } from '@/lib/signalEvent';

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers.get('x-admin-key');
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

export async function POST(
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
    const body = await req.json().catch(() => ({}));
    const eventText = typeof body?.eventText === 'string' ? body.eventText : undefined;

    const signal = await prisma.signal.update({
      where: { id },
      data: {
        publishStatus: 'PUBLISHED',
        publishAt: null, // clear schedule when publishing now
      },
    });

    await createSignalEvent(id, eventText);

    return NextResponse.json({ ok: true, signal });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }
    console.error('[admin/signals] Publish error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
