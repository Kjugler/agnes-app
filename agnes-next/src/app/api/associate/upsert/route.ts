'use server';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;

    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const emailRaw = body.email || '';
    const email = normalizeEmail(emailRaw);

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { ok: false, error: 'missing_fields' },
        { status: 400 },
      );
    }

    const phone = normalizePhone(body.phone ?? null);
    const handles = body.handles ?? {};
    const handleX = cleanHandle(handles.x);
    const handleInstagram = cleanHandle(handles.instagram);
    const handleTiktok = cleanHandle(handles.tiktok);
    const handleTruth = cleanHandle(handles.truth);

    const associateName = `${firstName} ${lastName}`.trim();

    const existing = await prisma.user.findUnique({ where: { email } });

    let code = existing?.code;
    let referralCode = existing?.referralCode;

    if (!code || !referralCode) {
      const generated = nanoid();
      code = code || generated;
      referralCode = referralCode || generated;
    }

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        fname: firstName,
        lname: lastName,
        firstName,
        code,
        referralCode,
        phone,
        handleX,
        handleInstagram,
        handleTiktok,
        handleTruth,
      },
      update: {
        fname: firstName,
        lname: lastName,
        firstName,
        phone,
        handleX,
        handleInstagram,
        handleTiktok,
        handleTruth,
      },
      select: {
        id: true,
        email: true,
        fname: true,
        lname: true,
        code: true,
        referralCode: true,
      },
    });

    const cookieStore = cookies();
    cookieStore.set('mockEmail', email, { httpOnly: false, path: '/', maxAge: 60 * 60 * 24 * 365 });
    cookieStore.set('ref', user.referralCode, { httpOnly: false, path: '/', maxAge: 60 * 60 * 24 * 365 });

    const name = user.fname && user.lname ? `${user.fname} ${user.lname}` : associateName;

    const res = NextResponse.json({
      ok: true,
      associateId: user.id,
      name,
      code: user.referralCode,
    });

    return res;
  } catch (err) {
    console.error('[associate/upsert] error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
