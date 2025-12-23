import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signalId = body?.signalId;

    if (typeof signalId !== 'string' || !signalId) {
      return NextResponse.json({ ok: false, error: 'signalId is required' }, { status: 400 });
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

    // Check if acknowledge exists
    const existing = await prisma.signalAcknowledge.findUnique({
      where: {
        signalId_userId: {
          signalId,
          userId: user.id,
        },
      },
    });

    let acknowledged: boolean;
    let count: number;

    if (existing) {
      // Delete (toggle off)
      await prisma.signalAcknowledge.delete({
        where: {
          id: existing.id,
        },
      });
      acknowledged = false;
    } else {
      // Create (toggle on)
      await prisma.signalAcknowledge.create({
        data: {
          signalId,
          userId: user.id,
        },
      });
      acknowledged = true;
    }

    // Get updated count
    count = await prisma.signalAcknowledge.count({
      where: { signalId },
    });

    return NextResponse.json({
      ok: true,
      acknowledged,
      count,
    });
  } catch (err: any) {
    console.error('[signal/ack] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

