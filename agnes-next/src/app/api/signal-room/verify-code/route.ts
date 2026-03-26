import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getSignalRoomAccessMode,
  getSignalRoomAccessCode,
  getSignalRoomCodeTtlMinutes,
  SIGNAL_ROOM_ACCESS_COOKIE,
} from '@/lib/signal-room-access';

export async function POST(req: NextRequest) {
  try {
    const mode = getSignalRoomAccessMode();
    if (mode !== 'code' && mode !== 'hybrid') {
      return NextResponse.json(
        { ok: false, error: 'Signal Room is not in code-required mode' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    const expectedCode = getSignalRoomAccessCode();
    if (!expectedCode) {
      return NextResponse.json(
        { ok: false, error: 'Access code not configured' },
        { status: 500 }
      );
    }

    if (code !== expectedCode) {
      return NextResponse.json(
        { ok: false, error: 'Invalid access code' },
        { status: 403 }
      );
    }

    const ttlMinutes = getSignalRoomCodeTtlMinutes();
    const cookieValue = ttlMinutes
      ? new Date().toISOString()
      : '1';
    const maxAgeSeconds = ttlMinutes
      ? ttlMinutes * 60
      : 60 * 60 * 24 * 30; // 30 days when no TTL

    const cookieStore = await cookies();
    cookieStore.set(SIGNAL_ROOM_ACCESS_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[signal-room/verify-code] Error:', err);
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
