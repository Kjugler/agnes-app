import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const events = await prisma.signalEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, eventText: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, events });
  } catch (err: unknown) {
    console.error('[signal/events] Error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
