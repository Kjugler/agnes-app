'use server';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { upsertAssociateByEmail } from '@/lib/associate';

function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return null;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function cleanHandle(handle: string | null | undefined) {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

type Payload = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  handles?: {
    x?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    truth?: string | null;
  };
  source?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const headerEmailRaw = req.headers.get('x-user-email');
    if (!headerEmailRaw) {
      return NextResponse.json({ ok: false, error: 'missing_user_email' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;

    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const emailRaw = body.email || headerEmailRaw;
    const email = normalizeEmail(emailRaw);
    const headerEmail = normalizeEmail(headerEmailRaw);

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { ok: false, error: 'missing_fields' },
        { status: 400 },
      );
    }

    if (email !== headerEmail) {
      return NextResponse.json(
        { ok: false, error: 'email_mismatch' },
        { status: 400 },
      );
    }

    const phone = normalizePhone(body.phone ?? null);
    const handles = body.handles ?? {};
    const handleX = cleanHandle(handles.x);
    const handleInstagram = cleanHandle(handles.instagram);
    const handleTiktok = cleanHandle(handles.tiktok);
    const handleTruth = cleanHandle(handles.truth);

    const user = await upsertAssociateByEmail(email, {
      fname: firstName,
      lname: lastName,
      firstName,
      phone,
      handleX,
      handleInstagram,
      handleTiktok,
      handleTruth,
    });

    const name = user.fname && user.lname ? `${user.fname} ${user.lname}` : `${firstName} ${lastName}`.trim();

    const res = NextResponse.json({
      ok: true,
      id: user.id,
      email: user.email,
      name,
      code: user.referralCode,
    });

    // Set cookies on response (Next.js 15 compatible)
    res.cookies.set('mockEmail', email, { httpOnly: false, path: '/', maxAge: 60 * 60 * 24 * 365 });
    res.cookies.set('ref', user.referralCode, { httpOnly: false, path: '/', maxAge: 60 * 60 * 24 * 365 });

    return res;
  } catch (err) {
    console.error('[associate/upsert] error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
