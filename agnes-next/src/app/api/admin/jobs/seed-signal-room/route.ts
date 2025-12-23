import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SignalStatus } from '@prisma/client';

const SYSTEM_SIGNALS = [
  {
    text: 'Protocol Challenge is live. New signals are being monitored.',
    isSystem: true,
    status: SignalStatus.APPROVED,
  },
  {
    text: 'A new reader entered through Terminal 2.',
    isSystem: true,
    status: SignalStatus.APPROVED,
  },
  {
    text: 'Someone shared The Protocol. A referral code is propagating.',
    isSystem: true,
    status: SignalStatus.APPROVED,
  },
  {
    text: 'Signal Room is online. Speak carefully. Signal carries.',
    isSystem: true,
    status: SignalStatus.APPROVED,
  },
  {
    text: 'Remember: describe your experience - don\'t quote the book.',
    isSystem: true,
    status: SignalStatus.APPROVED,
  },
];

export async function GET(req: NextRequest) {
  try {
    let created = 0;
    let updated = 0;

    for (const signalData of SYSTEM_SIGNALS) {
      // Use text as unique identifier for upsert
      const existing = await prisma.signal.findFirst({
        where: {
          text: signalData.text,
          isSystem: true,
        },
      });

      if (existing) {
        // Update if status changed
        if (existing.status !== signalData.status) {
          await prisma.signal.update({
            where: { id: existing.id },
            data: {
              status: signalData.status,
              approvedAt: signalData.status === SignalStatus.APPROVED ? new Date() : null,
            },
          });
          updated++;
        }
      } else {
        // Create new system signal
        await prisma.signal.create({
          data: {
            text: signalData.text,
            isSystem: signalData.isSystem,
            status: signalData.status,
            approvedAt: signalData.status === SignalStatus.APPROVED ? new Date() : null,
            countryCode: null,
            region: null,
          },
        });
        created++;
      }
    }

    const total = await prisma.signal.count({
      where: { isSystem: true },
    });

    return NextResponse.json({
      ok: true,
      created,
      updated,
      total,
    });
  } catch (err: any) {
    console.error('[seed-signal-room] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

