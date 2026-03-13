// Cron: Publish signals whose publishAt has passed
// Call from Vercel Cron or external scheduler (e.g. every 5 min)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSignalEvent } from '@/lib/signalEvent';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const toPublish = await prisma.signal.findMany({
      where: {
        publishStatus: 'DRAFT',
        publishAt: { lte: now },
      },
      select: { id: true },
    });

    let published = 0;
    for (const s of toPublish) {
      await prisma.signal.update({
        where: { id: s.id },
        data: { publishStatus: 'PUBLISHED', publishAt: null },
      });
      await createSignalEvent(s.id);
      published++;
    }

    return NextResponse.json({ ok: true, published });
  } catch (err: unknown) {
    console.error('[cron/publish-scheduled-signals] Error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
