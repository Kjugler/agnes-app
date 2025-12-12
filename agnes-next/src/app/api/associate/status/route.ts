'use server';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

export async function GET(req: NextRequest) {
  try {
    const headerEmail = req.headers.get('x-user-email');
    const queryEmail = req.nextUrl.searchParams.get('email');
    const cookieEmail =
      req.cookies.get('contest_email')?.value ||
      req.cookies.get('mockEmail')?.value ||
      req.cookies.get('user_email')?.value ||
      req.cookies.get('associate_email')?.value ||
      null;

    const emailRaw = cookieEmail || headerEmail || queryEmail;

    if (!emailRaw) {
      return NextResponse.json({ ok: false, error: 'missing_user_email' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    const select = {
      id: true,
      email: true,
      fname: true,
      lname: true,
      firstName: true,
      code: true,
      referralCode: true,
      handleX: true,
      handleInstagram: true,
      handleTiktok: true,
      handleTruth: true,
    } as const;

    let user = await prisma.user.findUnique({
      where: { email },
      select,
    });

    let newlyCreated = false;

    if (!user) {
      const ensured = await ensureAssociateMinimal(email);
      newlyCreated = true;
      user = await prisma.user.findUnique({
        where: { id: ensured.id },
        select,
      });
    }

    if (!user) {
      return NextResponse.json({
        ok: true,
        id: null,
        email,
        hasProfile: false,
        newlyCreated,
      });
    }

    const firstName = user.firstName || user.fname || null;
    const lastName = user.lname || null;
    const hasProfile = Boolean(firstName || lastName);
    const name =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || null;

    return NextResponse.json({
      ok: true,
      id: user.id,
      email: user.email,
      firstName,
      lastName,
      name,
      code: user.referralCode || user.code || null,
      hasProfile,
      newlyCreated,
      handles: {
        x: user.handleX,
        instagram: user.handleInstagram,
        tiktok: user.handleTiktok,
        truth: user.handleTruth,
      },
    });
  } catch (err) {
    console.error('[associate/status] error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

